// Protocol 28 - Billing Canister
// Cycles management and usage tracking

import Iter "mo:base/Iter";
import Principal "mo:base/Principal";
import Map "mo:base/OrderedMap";
import Time "mo:base/Time";
import Cycles "mo:base/ExperimentalCycles";
import Result "mo:base/Result";

persistent actor Billing {

    // Types
    public type Account = {
        owner: Principal;
        balance: Nat;
        totalDeposited: Nat;
        totalSpent: Nat;
        createdAt: Time.Time;
    };

    public type UsageRecord = {
        service: Text;
        amount: Nat;
        timestamp: Time.Time;
    };

    // Error messages are part of the public API: clients and tests match on them.
    // transient: in a persistent actor a plain `let` is stable, so edits to
    // these strings would otherwise be ignored on upgrade.
    transient let ERR_UNAUTHORIZED_CHARGER : Text = "Unauthorized: caller is not an authorized charger";
    transient let ERR_NOT_CONTROLLER : Text = "Unauthorized: only canister controllers can manage chargers";
    transient let ERR_ZERO_AMOUNT : Text = "Charge amount must be greater than zero";
    transient let ERR_ANONYMOUS_CHARGER : Text = "The anonymous principal cannot be an authorized charger";

    // Map operations for Principal keys. transient: holds functions and is
    // reconstructed deterministically on every upgrade.
    transient let accountOps = Map.Make<Principal>(Principal.compare);
    transient let chargerOps = Map.Make<Principal>(Principal.compare);

    // State. Persisted across upgrades via enhanced orthogonal persistence.
    var accounts : Map.Map<Principal, Account> = accountOps.empty();

    // Principals (the LEMNIS service canisters) allowed to debit user accounts.
    // Empty by default so a fresh deploy is closed until controllers opt in
    // each service explicitly. Persisted so upgrades never reopen charge().
    var authorizedChargers : Map.Map<Principal, ()> = chargerOps.empty();

    func isAuthorizedCharger(caller : Principal) : Bool {
        chargerOps.contains(authorizedChargers, caller)
    };

    // Grant a service canister the right to call charge(). Controllers only.
    public shared(msg) func addAuthorizedCharger(charger : Principal) : async Result.Result<(), Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        // Anonymous is shared by every unauthenticated caller, so allowlisting
        // it would reopen charge() to the whole internet.
        if (Principal.isAnonymous(charger)) {
            return #err(ERR_ANONYMOUS_CHARGER);
        };
        authorizedChargers := chargerOps.put(authorizedChargers, charger, ());
        #ok(())
    };

    // Revoke a service canister's right to call charge(). Controllers only.
    public shared(msg) func removeAuthorizedCharger(charger : Principal) : async Result.Result<(), Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        authorizedChargers := chargerOps.delete(authorizedChargers, charger);
        #ok(())
    };

    // Public on purpose: which services may bill users should be auditable.
    public query func listAuthorizedChargers() : async [Principal] {
        Iter.toArray(chargerOps.keys(authorizedChargers))
    };

    // Create or get account
    public shared(msg) func getOrCreateAccount() : async Account {
        switch (accountOps.get(accounts, msg.caller)) {
            case (?account) { account };
            case null {
                let newAccount : Account = {
                    owner = msg.caller;
                    balance = 0;
                    totalDeposited = 0;
                    totalSpent = 0;
                    createdAt = Time.now();
                };
                accounts := accountOps.put(accounts, msg.caller, newAccount);
                newAccount
            };
        };
    };

    // Deposit cycles
    public shared(msg) func deposit() : async Result.Result<Nat, Text> {
        let received = Cycles.accept(Cycles.available());

        if (received == 0) {
            return #err("No cycles received");
        };

        switch (accountOps.get(accounts, msg.caller)) {
            case (?account) {
                let updated : Account = {
                    owner = account.owner;
                    balance = account.balance + received;
                    totalDeposited = account.totalDeposited + received;
                    totalSpent = account.totalSpent;
                    createdAt = account.createdAt;
                };
                accounts := accountOps.put(accounts, msg.caller, updated);
                #ok(received)
            };
            case null {
                let newAccount : Account = {
                    owner = msg.caller;
                    balance = received;
                    totalDeposited = received;
                    totalSpent = 0;
                    createdAt = Time.now();
                };
                accounts := accountOps.put(accounts, msg.caller, newAccount);
                #ok(received)
            };
        };
    };

    // Check balance
    public query func getBalance(user: Principal) : async Nat {
        switch (accountOps.get(accounts, user)) {
            case (?account) { account.balance };
            case null { 0 };
        };
    };

    // Charge for service usage. Only allowlisted service canisters may debit
    // accounts; previously any caller could drain any user's balance.
    public shared(msg) func charge(user: Principal, amount: Nat, _service: Text) : async Result.Result<(), Text> {
        if (not isAuthorizedCharger(msg.caller)) {
            return #err(ERR_UNAUTHORIZED_CHARGER);
        };
        if (amount == 0) {
            return #err(ERR_ZERO_AMOUNT);
        };
        switch (accountOps.get(accounts, user)) {
            case null { #err("Account not found") };
            case (?account) {
                if (account.balance < amount) {
                    return #err("Insufficient balance");
                };

                let updated : Account = {
                    owner = account.owner;
                    balance = account.balance - amount;
                    totalDeposited = account.totalDeposited;
                    totalSpent = account.totalSpent + amount;
                    createdAt = account.createdAt;
                };
                accounts := accountOps.put(accounts, user, updated);
                #ok(())
            };
        };
    };

    // Get account details
    public shared(msg) func getAccount() : async ?Account {
        accountOps.get(accounts, msg.caller)
    };

    // Get current cycle exchange rate estimate
    public query func getCyclePrice() : async { cyclesPerICP: Nat; usdPerTrillionCycles: Nat } {
        // Approximate prices (would be dynamic in production)
        {
            cyclesPerICP = 1_000_000_000_000; // 1 ICP ≈ 1T cycles
            usdPerTrillionCycles = 100_000; // $1 = 10B cycles (approx)
        }
    };

    // Total platform stats
    public query func getPlatformStats() : async { accounts: Nat; totalCycles: Nat } {
        var total : Nat = 0;
        for ((_, account) in accountOps.entries(accounts)) {
            total += account.balance;
        };
        {
            accounts = accountOps.size(accounts);
            totalCycles = total;
        }
    };
}
