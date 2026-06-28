// Protocol 28 - Billing Canister
// Cycles management and usage tracking

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
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
    
    // State
    // transient: not persisted across canister upgrades (see CLAUDE.md).
    transient var accounts = HashMap.HashMap<Principal, Account>(10, Principal.equal, Principal.hash);
    
    // Create or get account
    public shared(msg) func getOrCreateAccount() : async Account {
        switch (accounts.get(msg.caller)) {
            case (?account) { account };
            case null {
                let newAccount : Account = {
                    owner = msg.caller;
                    balance = 0;
                    totalDeposited = 0;
                    totalSpent = 0;
                    createdAt = Time.now();
                };
                accounts.put(msg.caller, newAccount);
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
        
        switch (accounts.get(msg.caller)) {
            case (?account) {
                let updated : Account = {
                    owner = account.owner;
                    balance = account.balance + received;
                    totalDeposited = account.totalDeposited + received;
                    totalSpent = account.totalSpent;
                    createdAt = account.createdAt;
                };
                accounts.put(msg.caller, updated);
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
                accounts.put(msg.caller, newAccount);
                #ok(received)
            };
        };
    };
    
    // Check balance
    public query func getBalance(user: Principal) : async Nat {
        switch (accounts.get(user)) {
            case (?account) { account.balance };
            case null { 0 };
        };
    };
    
    // Charge for service usage (internal)
    public shared(msg) func charge(user: Principal, amount: Nat, service: Text) : async Result.Result<(), Text> {
        switch (accounts.get(user)) {
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
                accounts.put(user, updated);
                #ok(())
            };
        };
    };
    
    // Get account details
    public shared(msg) func getAccount() : async ?Account {
        accounts.get(msg.caller)
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
        for ((_, account) in accounts.entries()) {
            total += account.balance;
        };
        {
            accounts = accounts.size();
            totalCycles = total;
        }
    };
}
