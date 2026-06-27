// Protocol 28 - Compute Canister
// Handles WebAssembly execution and canister orchestration

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Time "mo:base/Time";
import Cycles "mo:base/ExperimentalCycles";
import Result "mo:base/Result";

actor Compute {
    
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
    
    // State
    // transient: not persisted across canister upgrades (see CLAUDE.md).
    transient var instances = HashMap.HashMap<Text, ComputeInstance>(10, Text.equal, Text.hash);
    transient var instanceCounter : Nat = 0;
    
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
        
        instances.put(id, instance);
        #ok(instance)
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
                let updated = {
                    instance with status = #stopped
                };
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
}
