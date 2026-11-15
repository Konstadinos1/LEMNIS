// Test-only fixture. Stands in for a LEMNIS service canister (compute,
// storage, ...) so integration tests can attach cycles to billing.deposit()
// and call billing.charge() with a canister principal as the caller.
// Ingress messages cannot carry cycles, which is why this proxy exists.

import Principal "mo:base/Principal";
import Result "mo:base/Result";

persistent actor ServiceProxy {

    type Billing = actor {
        deposit : () -> async Result.Result<Nat, Text>;
        charge : (Principal, Nat, Text) -> async Result.Result<(), Text>;
    };

    func billingActor(billingId : Principal) : Billing {
        actor (Principal.toText(billingId)) : Billing
    };

    // Funds this proxy's own billing account (the deposit is credited to the caller).
    public func depositCycles(billingId : Principal, amount : Nat) : async Result.Result<Nat, Text> {
        await (with cycles = amount) billingActor(billingId).deposit()
    };

    public func chargeUser(billingId : Principal, user : Principal, amount : Nat) : async Result.Result<(), Text> {
        await billingActor(billingId).charge(user, amount, "test-service")
    };
}
