// Protocol 28 - Compute Canister
// Handles WebAssembly execution and canister orchestration

import Principal "mo:base/Principal";
import Map "mo:base/OrderedMap";
import Array "mo:base/Array";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Time "mo:base/Time";
import Cycles "mo:base/ExperimentalCycles";
import Result "mo:base/Result";

persistent actor Compute {

    // Types
    public type ComputeInstance = {
        id: Text;
        owner: Principal;
        status: InstanceStatus;
        createdAt: Time.Time;
        cyclesBalance: Nat;
        memory: Nat; // bytes
    };

    public type InstanceStatus = {
        #running;
        #stopped;
        #terminated;
    };

    public type CreateResult = Result.Result<ComputeInstance, Text>;

    // Map operations for Text keys. transient: holds functions and is
    // reconstructed deterministically on every upgrade.
    transient let instanceOps = Map.Make<Text>(Text.compare);

    // State. Persisted across upgrades via enhanced orthogonal persistence.
    // The counter is persisted too, so instance IDs stay unique after upgrade.
    var instances : Map.Map<Text, ComputeInstance> = instanceOps.empty();
    var instanceCounter : Nat = 0;

    // Create a new compute instance
    public shared(msg) func createInstance(memory: Nat) : async CreateResult {
        let id = "compute-" # Nat.toText(instanceCounter);
        instanceCounter += 1;

        let instance : ComputeInstance = {
            id = id;
            owner = msg.caller;
            status = #running;
            createdAt = Time.now();
            cyclesBalance = Cycles.balance();
            memory = memory;
        };

        instances := instanceOps.put(instances, id, instance);
        #ok(instance)
    };

    // Get instance by ID
    public query func getInstance(id: Text) : async ?ComputeInstance {
        instanceOps.get(instances, id)
    };

    // List instances for caller
    public shared(msg) func listInstances() : async [ComputeInstance] {
        let caller = msg.caller;
        var result : [ComputeInstance] = [];

        for ((_, instance) in instanceOps.entries(instances)) {
            if (Principal.equal(instance.owner, caller)) {
                result := Array.append(result, [instance]);
            };
        };

        result
    };

    // Stop instance
    public shared(msg) func stopInstance(id: Text) : async Result.Result<(), Text> {
        switch (instanceOps.get(instances, id)) {
            case (?instance) {
                if (not Principal.equal(instance.owner, msg.caller)) {
                    return #err("Not authorized");
                };
                let updated = {
                    instance with status = #stopped
                };
                instances := instanceOps.put(instances, id, updated);
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
}
