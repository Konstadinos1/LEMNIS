// Protocol 28 - Compute & Deployment Registry Canister
// Manages ICP compute instances and Akash container deployments with strict lifecycle guards.

import Array "mo:base/Array";
import Cycles "mo:base/ExperimentalCycles";
import Nat "mo:base/Nat";
import Map "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";

persistent actor Compute {

    // Public Types
    public type InstanceStatus = {
        #running;
        #stopped;
        #terminated;
    };

    public type ComputeInstance = {
        id: Text;
        owner: Principal;
        status: InstanceStatus;
        createdAt: Time.Time;
        updatedAt: Time.Time;
        cyclesBalance: Nat;
        memory: Nat; // bytes
    };

    public type ComputeTarget = {
        #icp;
        #akash;
    };

    public type DeploymentState = {
        #pending;
        #creating;
        #active;
        #updating;
        #closing;
        #closed;
        #failed;
    };

    public type DeploymentRequest = {
        project: Text;
        target: ComputeTarget;
        image: Text;
        cpuMilli: Nat;
        memoryMiB: Nat;
        storageMiB: Nat;
        gpuCount: Nat;
        region: ?Text;
        awsHourlyMicroUsd: Nat;
        maxHourlyMicroUsd: Nat;
    };

    public type Deployment = {
        id: Text;
        project: Text;
        owner: Principal;
        target: ComputeTarget;
        image: Text;
        cpuMilli: Nat;
        memoryMiB: Nat;
        storageMiB: Nat;
        gpuCount: Nat;
        region: ?Text;
        awsHourlyMicroUsd: Nat;
        maxHourlyMicroUsd: Nat;
        actualHourlyMicroUsd: ?Nat;
        providerUri: ?Text;
        dseq: ?Text;
        state: DeploymentState;
        lastError: ?Text;
        createdAt: Time.Time;
        updatedAt: Time.Time;
    };

    public type CreateResult = Result.Result<ComputeInstance, Text>;
    public type DeploymentResult = Result.Result<Deployment, Text>;

    // Named limits & error strings (transient so edits apply across upgrades).
    transient let MIN_MEMORY_BYTES : Nat = 67_108_864;       // 64 MiB
    transient let MAX_MEMORY_BYTES : Nat = 68_719_476_736;   // 64 GiB
    transient let MAX_INSTANCES_PER_OWNER : Nat = 50;
    transient let MAX_DEPLOYMENTS_PER_OWNER : Nat = 50;
    transient let MIN_CPU_MILLI : Nat = 100;                 // 0.1 vCPU
    transient let MAX_CPU_MILLI : Nat = 64_000;              // 64 vCPU
    transient let MIN_MEMORY_MIB : Nat = 128;                // 128 MiB
    transient let MAX_MEMORY_MIB : Nat = 524_288;            // 512 GiB
    transient let MAX_STORAGE_MIB : Nat = 2_097_152;         // 2 TiB
    transient let MAX_GPU_COUNT : Nat = 8;
    transient let MAX_TEXT_LEN : Nat = 256;

    transient let ERR_ANONYMOUS : Text = "Anonymous principal is not permitted";
    transient let ERR_NOT_AUTHORIZED : Text = "Not authorized";
    transient let ERR_NOT_CONTROLLER : Text = "Unauthorized: controller privileges required";
    transient let ERR_INSTANCE_NOT_FOUND : Text = "Instance not found";
    transient let ERR_DEPLOYMENT_NOT_FOUND : Text = "Deployment not found";
    transient let ERR_INVALID_MEMORY : Text = "Memory must be between 64 MiB and 64 GiB";
    transient let ERR_QUOTA_EXCEEDED : Text = "Active resource quota exceeded";

    // Map operations (transient: function records are non-stable).
    transient let textOps = Map.Make<Text>(Text.compare);

    // Persisted state.
    var instances : Map.Map<Text, ComputeInstance> = textOps.empty();
    var deployments : Map.Map<Text, Deployment> = textOps.empty();
    var instanceCounter : Nat = 0;
    var deploymentCounter : Nat = 0;
    var bridgePrincipal : ?Principal = null;

    func isBridgeOrController(caller: Principal) : Bool {
        if (Principal.isController(caller)) {
            return true;
        };
        switch (bridgePrincipal) {
            case (?b) { Principal.equal(b, caller) };
            case null { false };
        }
    };

    func countActiveInstances(owner: Principal) : Nat {
        var count : Nat = 0;
        for ((_, inst) in textOps.entries(instances)) {
            if (Principal.equal(inst.owner, owner)) {
                switch (inst.status) {
                    case (#terminated) {};
                    case _ { count += 1; };
                };
            };
        };
        count
    };

    func countLiveDeployments(owner: Principal) : Nat {
        var count : Nat = 0;
        for ((_, dep) in textOps.entries(deployments)) {
            if (Principal.equal(dep.owner, owner)) {
                switch (dep.state) {
                    case (#closed or #failed) {};
                    case _ { count += 1; };
                };
            };
        };
        count
    };

    func validateDeploymentRequest(req: DeploymentRequest) : ?Text {
        if (req.project.size() < 2 or req.project.size() > 63) {
            return ?"Project name must be 2-63 characters";
        };
        if (req.image.size() < 3 or req.image.size() > MAX_TEXT_LEN) {
            return ?"Container image reference must be 3-256 characters";
        };
        if (req.cpuMilli < MIN_CPU_MILLI or req.cpuMilli > MAX_CPU_MILLI) {
            return ?"CPU must be between 100m (0.1 vCPU) and 64000m (64 vCPU)";
        };
        if (req.memoryMiB < MIN_MEMORY_MIB or req.memoryMiB > MAX_MEMORY_MIB) {
            return ?"Memory must be between 128 MiB and 512 GiB";
        };
        if (req.storageMiB > MAX_STORAGE_MIB) {
            return ?"Storage cannot exceed 2 TiB";
        };
        if (req.gpuCount > MAX_GPU_COUNT) {
            return ?"GPU count cannot exceed 8 per deployment";
        };
        if (req.maxHourlyMicroUsd == 0) {
            return ?"Maximum hourly bid cap must be greater than zero";
        };
        null
    };

    // Configure the off-chain Akash bridge principal authorized to reconcile deployment state.
    public shared(msg) func setBridgePrincipal(bridge: Principal) : async Result.Result<(), Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        if (Principal.isAnonymous(bridge)) {
            return #err(ERR_ANONYMOUS);
        };
        bridgePrincipal := ?bridge;
        #ok(())
    };

    public query func getBridgePrincipal() : async ?Principal {
        bridgePrincipal
    };

    // Create a new ICP compute instance. Cycles attached to the call seed its balance.
    public shared(msg) func createInstance(memory: Nat) : async CreateResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        if (memory < MIN_MEMORY_BYTES or memory > MAX_MEMORY_BYTES) {
            return #err(ERR_INVALID_MEMORY);
        };
        if (countActiveInstances(msg.caller) >= MAX_INSTANCES_PER_OWNER) {
            return #err(ERR_QUOTA_EXCEEDED);
        };

        let id = "compute-" # Nat.toText(instanceCounter);
        instanceCounter += 1;
        let now = Time.now();
        // Record only cycles explicitly attached to this creation call, not the canister's whole pool.
        let attachedCycles = Cycles.accept<system>(Cycles.available());

        let instance : ComputeInstance = {
            id = id;
            owner = msg.caller;
            status = #running;
            createdAt = now;
            updatedAt = now;
            cyclesBalance = attachedCycles;
            memory = memory;
        };

        instances := textOps.put(instances, id, instance);
        #ok(instance)
    };

    // Get instance by ID (owner or controller only).
    public shared query(msg) func getInstance(id: Text) : async Result.Result<ComputeInstance, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(instances, id)) {
            case null { #err(ERR_INSTANCE_NOT_FOUND) };
            case (?inst) {
                if (not Principal.equal(inst.owner, msg.caller) and not Principal.isController(msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                #ok(inst)
            };
        }
    };

    // List instances owned by caller.
    public shared query(msg) func listInstances() : async [ComputeInstance] {
        if (Principal.isAnonymous(msg.caller)) {
            return [];
        };
        var result : [ComputeInstance] = [];
        for ((_, instance) in textOps.entries(instances)) {
            if (Principal.equal(instance.owner, msg.caller)) {
                result := Array.append(result, [instance]);
            };
        };
        result
    };

    // Stop a running instance (strict state transition: #running -> #stopped).
    public shared(msg) func stopInstance(id: Text) : async Result.Result<(), Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(instances, id)) {
            case null { #err(ERR_INSTANCE_NOT_FOUND) };
            case (?instance) {
                if (not Principal.equal(instance.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                switch (instance.status) {
                    case (#running) {
                        let updated = { instance with status = #stopped; updatedAt = Time.now() };
                        instances := textOps.put(instances, id, updated);
                        #ok(())
                    };
                    case (#stopped) { #err("Instance is already stopped") };
                    case (#terminated) { #err("Cannot stop a terminated instance") };
                }
            };
        }
    };

    // Restart a stopped instance (strict state transition: #stopped -> #running).
    public shared(msg) func startInstance(id: Text) : async Result.Result<(), Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(instances, id)) {
            case null { #err(ERR_INSTANCE_NOT_FOUND) };
            case (?instance) {
                if (not Principal.equal(instance.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                switch (instance.status) {
                    case (#stopped) {
                        let updated = { instance with status = #running; updatedAt = Time.now() };
                        instances := textOps.put(instances, id, updated);
                        #ok(())
                    };
                    case (#running) { #err("Instance is already running") };
                    case (#terminated) { #err("Cannot restart a terminated instance") };
                }
            };
        }
    };

    // Permanently terminate a running or stopped instance.
    public shared(msg) func terminateInstance(id: Text) : async Result.Result<(), Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(instances, id)) {
            case null { #err(ERR_INSTANCE_NOT_FOUND) };
            case (?instance) {
                if (not Principal.equal(instance.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                switch (instance.status) {
                    case (#terminated) { #err("Instance is already terminated") };
                    case _ {
                        let updated = { instance with status = #terminated; updatedAt = Time.now() };
                        instances := textOps.put(instances, id, updated);
                        #ok(())
                    };
                }
            };
        }
    };

    // Request a new containerized deployment (Akash or ICP) with validated specs & bid cap.
    public shared(msg) func requestDeployment(req: DeploymentRequest) : async DeploymentResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (validateDeploymentRequest(req)) {
            case (?errMsg) { return #err(errMsg); };
            case null {};
        };
        if (countLiveDeployments(msg.caller) >= MAX_DEPLOYMENTS_PER_OWNER) {
            return #err(ERR_QUOTA_EXCEEDED);
        };
        let id = "dep-" # Nat.toText(deploymentCounter);
        deploymentCounter += 1;
        let now = Time.now();
        let dep : Deployment = {
            id = id;
            project = req.project;
            owner = msg.caller;
            target = req.target;
            image = req.image;
            cpuMilli = req.cpuMilli;
            memoryMiB = req.memoryMiB;
            storageMiB = req.storageMiB;
            gpuCount = req.gpuCount;
            region = req.region;
            awsHourlyMicroUsd = req.awsHourlyMicroUsd;
            maxHourlyMicroUsd = req.maxHourlyMicroUsd;
            actualHourlyMicroUsd = null;
            providerUri = null;
            dseq = null;
            state = #pending;
            lastError = null;
            createdAt = now;
            updatedAt = now;
        };
        deployments := textOps.put(deployments, id, dep);
        #ok(dep)
    };

    // List deployments owned by the caller.
    public shared query(msg) func listDeployments() : async [Deployment] {
        if (Principal.isAnonymous(msg.caller)) {
            return [];
        };
        var result : [Deployment] = [];
        for ((_, dep) in textOps.entries(deployments)) {
            if (Principal.equal(dep.owner, msg.caller)) {
                result := Array.append(result, [dep]);
            };
        };
        result
    };

    // Get a single deployment (owner, bridge, or controller only).
    public shared query(msg) func getDeployment(id: Text) : async Result.Result<Deployment, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(deployments, id)) {
            case null { #err(ERR_DEPLOYMENT_NOT_FOUND) };
            case (?dep) {
                if (not Principal.equal(dep.owner, msg.caller) and not isBridgeOrController(msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                #ok(dep)
            };
        }
    };

    // Owner requests closing an active/pending deployment.
    public shared(msg) func requestCloseDeployment(id: Text) : async DeploymentResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(deployments, id)) {
            case null { #err(ERR_DEPLOYMENT_NOT_FOUND) };
            case (?dep) {
                if (not Principal.equal(dep.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                switch (dep.state) {
                    case (#closed or #failed) { return #err("Deployment is already finalized"); };
                    case (#closing) { return #err("Deployment is already closing"); };
                    case _ {
                        let nextState : DeploymentState = switch (dep.dseq) {
                            case null { #closed };
                            case (?_) { #closing };
                        };
                        let updated : Deployment = { dep with state = nextState; updatedAt = Time.now() };
                        deployments := textOps.put(deployments, id, updated);
                        #ok(updated)
                    };
                }
            };
        }
    };

    // Bridge/controller-only reconciliation transition (records Akash dseq, lease URI, actual rate).
    public shared(msg) func transitionDeployment(
        id: Text,
        newState: DeploymentState,
        dseq: ?Text,
        providerUri: ?Text,
        actualHourlyMicroUsd: ?Nat,
        lastError: ?Text
    ) : async DeploymentResult {
        if (not isBridgeOrController(msg.caller)) {
            return #err(ERR_NOT_AUTHORIZED);
        };
        switch (textOps.get(deployments, id)) {
            case null { #err(ERR_DEPLOYMENT_NOT_FOUND) };
            case (?dep) {
                // Enforce the 50% savings bid cap when activating a lease.
                switch (actualHourlyMicroUsd) {
                    case (?rate) {
                        if (rate > dep.maxHourlyMicroUsd) {
                            return #err("Provider lease rate exceeds deployment bid cap");
                        };
                    };
                    case null {};
                };
                let updated : Deployment = {
                    dep with
                    state = newState;
                    dseq = switch (dseq) { case (?v) { ?v }; case null { dep.dseq } };
                    providerUri = switch (providerUri) { case (?v) { ?v }; case null { dep.providerUri } };
                    actualHourlyMicroUsd = switch (actualHourlyMicroUsd) {
                        case (?v) { ?v };
                        case null { dep.actualHourlyMicroUsd };
                    };
                    lastError = lastError;
                    updatedAt = Time.now();
                };
                deployments := textOps.put(deployments, id, updated);
                #ok(updated)
            };
        }
    };

    // Get canister cycles balance (controllers only).
    public shared query(msg) func getAvailableCycles() : async Result.Result<Nat, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        #ok(Cycles.balance())
    };
}
