// Protocol 28 - Compute Canister
// Multi-provider compute orchestration: ICP, Akash, Render, io.net
// Smart routing picks cheapest provider; capitalizes on DePIN token discounts

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Time "mo:base/Time";
import Cycles "mo:base/ExperimentalCycles";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Nat "mo:base/Nat";

actor Compute {

    // Types
    public type ComputeProvider = {
        #icp;         // ICP canisters - persistent, autonomous
        #akash;       // Akash Network - cheap containers ($0.018/vCPU-hr)
        #render;      // Render Network - GPU compute ($1.40/hr)
        #ionet;       // io.net - GPU aggregator ($0.50/hr)
        #nosana;      // Nosana - CI/CD pipelines ($0.10/hr)
    };

    public type InstanceSpec = {
        vcpu: Nat;           // vCPU count
        memoryMB: Nat;       // Memory in MB
        gpuType: ?GPUType;   // Optional GPU
        region: ?Text;       // Preferred region
    };

    public type GPUType = {
        #h100;    // NVIDIA H100 - $1.40/hr (Render/Akash)
        #a100;    // NVIDIA A100 - $0.80/hr (io.net)
        #rtx4090; // RTX 4090 - $0.35/hr (Akash/io.net)
        #t4;      // Tesla T4 - $0.15/hr (io.net)
    };

    public type ComputeInstance = {
        id: Text;
        owner: Principal;
        provider: ComputeProvider;
        spec: InstanceSpec;
        status: InstanceStatus;
        createdAt: Time.Time;
        cyclesBalance: Nat;
        memory: Nat;
        costPerHour: Nat;    // Micro-USD per hour
        totalCost: Nat;      // Total micro-USD spent
    };

    public type InstanceStatus = {
        #running;
        #stopped;
        #terminated;
        #provisioning;
    };

    public type CreateResult = Result.Result<ComputeInstance, Text>;

    public type ProviderPricing = {
        provider: ComputeProvider;
        vcpuHourMicroUSD: Nat;
        memGBHourMicroUSD: Nat;
        gpuH100HourMicroUSD: Nat;
        gpuA100HourMicroUSD: Nat;
        available: Bool;
        depinDiscount: Nat;      // Extra discount % from pre-bought tokens
    };

    // State
    private var instances = HashMap.HashMap<Text, ComputeInstance>(10, Text.equal, Text.hash);
    private var instanceCounter : Nat = 0;
    private var providerPrices = HashMap.HashMap<Text, ProviderPricing>(5, Text.equal, Text.hash);

    // Initialize provider pricing (bear market rates - significantly cheaper)
    private func _initPricing() {
        // These rates reflect depressed DePIN token valuations
        providerPrices.put("akash", {
            provider = #akash;
            vcpuHourMicroUSD = 18_000;       // $0.018/vCPU-hr (65% cheaper than AWS)
            memGBHourMicroUSD = 9_000;        // $0.009/GB-hr
            gpuH100HourMicroUSD = 1_400_000;  // $1.40/hr (vs $3.50 AWS)
            gpuA100HourMicroUSD = 800_000;    // $0.80/hr (vs $2.10 AWS)
            available = true;
            depinDiscount = 15;               // 15% extra from AKT dip-buying
        });
        providerPrices.put("render", {
            provider = #render;
            vcpuHourMicroUSD = 0;
            memGBHourMicroUSD = 0;
            gpuH100HourMicroUSD = 1_400_000;
            gpuA100HourMicroUSD = 900_000;
            available = true;
            depinDiscount = 20;               // RNDR heavily discounted from ATH
        });
        providerPrices.put("ionet", {
            provider = #ionet;
            vcpuHourMicroUSD = 15_000;
            memGBHourMicroUSD = 8_000;
            gpuH100HourMicroUSD = 1_200_000;
            gpuA100HourMicroUSD = 500_000;
            available = true;
            depinDiscount = 25;               // IO token deep discount
        });
        providerPrices.put("nosana", {
            provider = #nosana;
            vcpuHourMicroUSD = 12_000;
            memGBHourMicroUSD = 6_000;
            gpuH100HourMicroUSD = 0;
            gpuA100HourMicroUSD = 0;
            available = true;
            depinDiscount = 30;
        });
    };

    // Create instance with smart provider routing
    public shared(msg) func createInstance(memory: Nat) : async CreateResult {
        let id = "compute-" # Nat.toText(instanceCounter);
        instanceCounter += 1;

        let instance : ComputeInstance = {
            id = id;
            owner = msg.caller;
            provider = #icp;
            spec = { vcpu = 1; memoryMB = memory / (1024 * 1024); gpuType = null; region = null };
            status = #running;
            createdAt = Time.now();
            cyclesBalance = Cycles.balance();
            memory = memory;
            costPerHour = 0; // ICP uses cycles, not USD
            totalCost = 0;
        };

        instances.put(id, instance);
        #ok(instance)
    };

    // Create with specific provider and GPU selection
    public shared(msg) func createInstanceAdvanced(
        spec: InstanceSpec,
        preferredProvider: ?ComputeProvider
    ) : async CreateResult {

        let provider = switch (preferredProvider) {
            case (?p) { p };
            case null { _cheapestProvider(spec) };
        };

        let costPerHour = _estimateCost(provider, spec);

        let id = "compute-" # Nat.toText(instanceCounter);
        instanceCounter += 1;

        let instance : ComputeInstance = {
            id = id;
            owner = msg.caller;
            provider = provider;
            spec = spec;
            status = #provisioning;
            createdAt = Time.now();
            cyclesBalance = Cycles.balance();
            memory = spec.memoryMB * 1024 * 1024;
            costPerHour = costPerHour;
            totalCost = 0;
        };

        instances.put(id, instance);
        #ok(instance)
    };

    // Get cheapest provider comparison for given spec
    public query func compareProviders(spec: InstanceSpec) : async [{ provider: Text; costPerHour: Nat; savings: Text }] {
        let awsCost = _awsEquivalentCost(spec);
        [
            { provider = "akash"; costPerHour = _estimateCost(#akash, spec); savings = "65-85% vs AWS" },
            { provider = "ionet"; costPerHour = _estimateCost(#ionet, spec); savings = "70-90% vs AWS" },
            { provider = "render"; costPerHour = _estimateCost(#render, spec); savings = "60-75% vs AWS" },
            { provider = "nosana"; costPerHour = _estimateCost(#nosana, spec); savings = "75-90% vs AWS" },
            { provider = "aws_equivalent"; costPerHour = awsCost; savings = "0% (baseline)" },
        ]
    };

    // Get instance by ID
    public query func getInstance(id: Text) : async ?ComputeInstance {
        instances.get(id)
    };

    // List instances for caller
    public shared(msg) func listInstances() : async [ComputeInstance] {
        let caller = msg.caller;
        var result : [ComputeInstance] = [];
        for ((_, instance) in instances.entries()) {
            if (Principal.equal(instance.owner, caller)) {
                result := Array.append(result, [instance]);
            };
        };
        result
    };

    // Stop instance
    public shared(msg) func stopInstance(id: Text) : async Result.Result<(), Text> {
        switch (instances.get(id)) {
            case (?instance) {
                if (not Principal.equal(instance.owner, msg.caller)) {
                    return #err("Not authorized");
                };
                let updated = { instance with status = #stopped };
                instances.put(id, updated);
                #ok(())
            };
            case null {
                #err("Instance not found")
            };
        };
    };

    // Get available cycles
    public query func getAvailableCycles() : async Nat {
        Cycles.balance()
    };

    // ── Private: Cost Estimation ───────────────────────────────────────

    private func _cheapestProvider(spec: InstanceSpec) : ComputeProvider {
        switch (spec.gpuType) {
            case (?#h100) { #ionet };       // io.net cheapest for H100
            case (?#a100) { #ionet };       // io.net cheapest for A100
            case (?#rtx4090) { #akash };    // Akash cheapest for consumer GPU
            case (?#t4) { #ionet };         // io.net cheapest for T4
            case null { #akash };            // Akash cheapest for CPU workloads
        };
    };

    private func _estimateCost(provider: ComputeProvider, spec: InstanceSpec) : Nat {
        let baseCost = switch (provider) {
            case (#akash) { spec.vcpu * 18_000 + (spec.memoryMB / 1024) * 9_000 };
            case (#render) {
                switch (spec.gpuType) {
                    case (?#h100) { 1_400_000 };
                    case (?#a100) { 900_000 };
                    case (_) { 500_000 };
                };
            };
            case (#ionet) { spec.vcpu * 15_000 + (spec.memoryMB / 1024) * 8_000 };
            case (#nosana) { spec.vcpu * 12_000 + (spec.memoryMB / 1024) * 6_000 };
            case (#icp) { 0 }; // Cycles-based
        };

        // Apply GPU cost if applicable
        let gpuCost = switch (spec.gpuType) {
            case (?#h100) {
                switch (provider) {
                    case (#ionet) { 1_200_000 };
                    case (_) { 1_400_000 };
                };
            };
            case (?#a100) {
                switch (provider) {
                    case (#ionet) { 500_000 };
                    case (_) { 800_000 };
                };
            };
            case (?#rtx4090) { 350_000 };
            case (?#t4) { 150_000 };
            case null { 0 };
        };

        baseCost + gpuCost
    };

    private func _awsEquivalentCost(spec: InstanceSpec) : Nat {
        let cpuCost = spec.vcpu * 50_000; // ~$0.05/vCPU-hr on AWS
        let memCost = (spec.memoryMB / 1024) * 25_000;
        let gpuCost = switch (spec.gpuType) {
            case (?#h100) { 3_500_000 };  // $3.50/hr on AWS
            case (?#a100) { 2_100_000 };  // $2.10/hr on AWS
            case (?#rtx4090) { 1_200_000 };
            case (?#t4) { 500_000 };
            case null { 0 };
        };
        cpuCost + memCost + gpuCost
    };
}
