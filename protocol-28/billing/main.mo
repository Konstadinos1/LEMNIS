// Protocol 28 - Billing & Credits Canister
// Manages ICP cycles balances, prepaid USD credits (micro-USD), authorized chargers,
// and an idempotent usage ledger for accurate savings tracking.

import Array "mo:base/Array";
import Cycles "mo:base/ExperimentalCycles";
import Int "mo:base/Int";
import Iter "mo:base/Iter";
import Map "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";

persistent actor Billing {

    // Public Types
    public type Account = {
        owner: Principal;
        balance: Nat;                // ICP cycles balance
        totalDeposited: Nat;         // Lifetime deposited cycles
        totalSpent: Nat;             // Lifetime spent cycles
        creditsMicroUsd: Nat;        // Prepaid USD credits (1 USD = 1_000_000 micro-USD)
        grantedMicroUsd: Nat;        // Lifetime granted USD credits
        spentMicroUsd: Nat;          // Lifetime billed USD credits
        awsEquivalentMicroUsd: Nat;  // Lifetime AWS on-demand equivalent for savings tracking
        createdAt: Time.Time;
    };

    public type UsageRecord = {
        idempotencyKey: Text;
        owner: Principal;
        service: Text;
        cyclesCharged: Nat;
        akashCostMicroUsd: Nat;
        chargedMicroUsd: Nat;
        awsEquivalentMicroUsd: Nat;
        timestamp: Time.Time;
    };

    public type SavingsSummary = {
        remainingCreditsMicroUsd: Nat;
        spentMicroUsd: Nat;
        awsEquivalentMicroUsd: Nat;
        savedMicroUsd: Nat;
        markupBps: Nat;
    };

    public type CyclePrice = {
        cyclesPerICP: Nat;
        microUsdPerTrillionCycles: Nat; // 1_400_000 = $1.40 per 1T cycles
    };

    public type UsageChargeResult = {
        remainingCreditsMicroUsd: Nat;
        exhausted: Bool;
        duplicate: Bool;
    };

    // Named constants & error strings (transient so edits apply across upgrades).
    transient let DEFAULT_CYCLES_PER_ICP : Nat = 1_000_000_000_000;          // 1T cycles baseline
    transient let DEFAULT_MICRO_USD_PER_TRILLION_CYCLES : Nat = 1_400_000;   // ~$1.40 per 1T cycles (1 XDR)
    transient let DEFAULT_MARKUP_BPS : Nat = 2_000;                          // 20.00%
    transient let MAX_MARKUP_BPS : Nat = 2_500;                              // 25.00% ceiling protects >50% savings
    transient let BPS_DENOMINATOR : Nat = 10_000;
    transient let MAX_USAGE_HISTORY_PER_USER : Nat = 1_000;
    transient let MAX_KEY_LEN : Nat = 128;

    transient let ERR_ANONYMOUS : Text = "Anonymous principal is not permitted";
    transient let ERR_NOT_CONTROLLER : Text = "Unauthorized: only canister controllers can perform this action";
    transient let ERR_UNAUTHORIZED_CHARGER : Text = "Unauthorized: caller is not an authorized charger";
    transient let ERR_NOT_AUTHORIZED : Text = "Not authorized";
    transient let ERR_ACCOUNT_NOT_FOUND : Text = "Account not found";
    transient let ERR_ZERO_AMOUNT : Text = "Amount must be greater than zero";
    transient let ERR_ANONYMOUS_CHARGER : Text = "The anonymous principal cannot be an authorized charger";
    transient let ERR_INSUFFICIENT_BALANCE : Text = "Insufficient balance";
    transient let ERR_MARKUP_TOO_HIGH : Text = "Markup cannot exceed 2500 bps (25%)";

    // Map operations (transient: function records are non-stable).
    transient let principalOps = Map.Make<Principal>(Principal.compare);
    transient let textOps = Map.Make<Text>(Text.compare);

    // Persisted state.
    var accounts : Map.Map<Principal, Account> = principalOps.empty();
    // Principals (service canisters / bridge) permitted to debit user balances. Empty by default.
    var authorizedChargers : Map.Map<Principal, ()> = principalOps.empty();
    // Idempotency registry preventing duplicate charges on retry.
    var recordedUsageKeys : Map.Map<Text, UsageRecord> = textOps.empty();
    var userUsageHistory : Map.Map<Principal, [UsageRecord]> = principalOps.empty();
    var markupBps : Nat = DEFAULT_MARKUP_BPS;
    var cyclesPerICP : Nat = DEFAULT_CYCLES_PER_ICP;
    var microUsdPerTrillionCycles : Nat = DEFAULT_MICRO_USD_PER_TRILLION_CYCLES;

    func isAuthorizedCharger(caller: Principal) : Bool {
        principalOps.contains(authorizedChargers, caller)
    };

    func emptyAccount(owner: Principal) : Account {
        {
            owner = owner;
            balance = 0;
            totalDeposited = 0;
            totalSpent = 0;
            creditsMicroUsd = 0;
            grantedMicroUsd = 0;
            spentMicroUsd = 0;
            awsEquivalentMicroUsd = 0;
            createdAt = Time.now();
        }
    };

    func appendUserUsage(owner: Principal, rec: UsageRecord) {
        let existing = switch (principalOps.get(userUsageHistory, owner)) {
            case (?arr) { arr };
            case null { [] };
        };
        let next = if (existing.size() >= MAX_USAGE_HISTORY_PER_USER) {
            // Keep the most recent records bounded to avoid unbounded canister heap growth.
            let trimmedLen : Nat = existing.size() - 1;
            let trimmed = Array.subArray(existing, 1, trimmedLen);
            Array.append(trimmed, [rec])
        } else {
            Array.append(existing, [rec])
        };
        userUsageHistory := principalOps.put(userUsageHistory, owner, next);
    };

    // Authorize a service canister or bridge principal to debit accounts (controllers only).
    public shared(msg) func addAuthorizedCharger(charger: Principal) : async Result.Result<(), Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        if (Principal.isAnonymous(charger)) {
            return #err(ERR_ANONYMOUS_CHARGER);
        };
        authorizedChargers := principalOps.put(authorizedChargers, charger, ());
        #ok(())
    };

    // Revoke a service canister's billing rights (controllers only).
    public shared(msg) func removeAuthorizedCharger(charger: Principal) : async Result.Result<(), Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        authorizedChargers := principalOps.delete(authorizedChargers, charger);
        #ok(())
    };

    // Public on purpose so users can audit which principals are allowed to debit accounts.
    public query func listAuthorizedChargers() : async [Principal] {
        Iter.toArray(principalOps.keys(authorizedChargers))
    };

    // Configure platform markup in basis points (controllers only, capped at 25%).
    public shared(msg) func setMarkupBps(nextBps: Nat) : async Result.Result<Nat, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        if (nextBps > MAX_MARKUP_BPS) {
            return #err(ERR_MARKUP_TOO_HIGH);
        };
        markupBps := nextBps;
        #ok(markupBps)
    };

    // Update cycle price oracle parameters (controllers only).
    public shared(msg) func setCyclePrice(
        nextCyclesPerICP: Nat,
        nextMicroUsdPerTrillion: Nat
    ) : async Result.Result<CyclePrice, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        if (nextCyclesPerICP == 0 or nextMicroUsdPerTrillion == 0) {
            return #err(ERR_ZERO_AMOUNT);
        };
        cyclesPerICP := nextCyclesPerICP;
        microUsdPerTrillionCycles := nextMicroUsdPerTrillion;
        #ok({ cyclesPerICP; microUsdPerTrillionCycles })
    };

    // Create or retrieve caller's billing account.
    public shared(msg) func getOrCreateAccount() : async Result.Result<Account, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (principalOps.get(accounts, msg.caller)) {
            case (?account) { #ok(account) };
            case null {
                let newAccount = emptyAccount(msg.caller);
                accounts := principalOps.put(accounts, msg.caller, newAccount);
                #ok(newAccount)
            };
        }
    };

    // Deposit ICP cycles into caller's account.
    public shared(msg) func deposit() : async Result.Result<Nat, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        let received = Cycles.accept<system>(Cycles.available());
        if (received == 0) {
            return #err("No cycles received");
        };
        let existing = switch (principalOps.get(accounts, msg.caller)) {
            case (?acc) { acc };
            case null { emptyAccount(msg.caller) };
        };
        let updated : Account = {
            existing with
            balance = existing.balance + received;
            totalDeposited = existing.totalDeposited + received;
        };
        accounts := principalOps.put(accounts, msg.caller, updated);
        #ok(received)
    };

    // Grant prepaid USD credits to a user account after off-chain settlement (controllers only).
    public shared(msg) func grantCredits(
        user: Principal,
        amountMicroUsd: Nat,
        _referenceNote: Text
    ) : async Result.Result<Account, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        if (Principal.isAnonymous(user)) {
            return #err(ERR_ANONYMOUS);
        };
        if (amountMicroUsd == 0) {
            return #err(ERR_ZERO_AMOUNT);
        };
        let existing = switch (principalOps.get(accounts, user)) {
            case (?acc) { acc };
            case null { emptyAccount(user) };
        };
        let updated : Account = {
            existing with
            creditsMicroUsd = existing.creditsMicroUsd + amountMicroUsd;
            grantedMicroUsd = existing.grantedMicroUsd + amountMicroUsd;
        };
        accounts := principalOps.put(accounts, user, updated);
        #ok(updated)
    };

    // Charge cycles for ICP service usage (authorized service canisters only).
    public shared(msg) func charge(
        user: Principal,
        amount: Nat,
        service: Text
    ) : async Result.Result<(), Text> {
        if (not isAuthorizedCharger(msg.caller)) {
            return #err(ERR_UNAUTHORIZED_CHARGER);
        };
        if (amount == 0) {
            return #err(ERR_ZERO_AMOUNT);
        };
        switch (principalOps.get(accounts, user)) {
            case null { #err(ERR_ACCOUNT_NOT_FOUND) };
            case (?account) {
                if (account.balance < amount) {
                    return #err(ERR_INSUFFICIENT_BALANCE);
                };
                let updated : Account = {
                    account with
                    balance = account.balance - amount;
                    totalSpent = account.totalSpent + amount;
                };
                accounts := principalOps.put(accounts, user, updated);
                let rec : UsageRecord = {
                    idempotencyKey = "cycles:" # service # ":" # Int.toText(Time.now());
                    owner = user;
                    service = service;
                    cyclesCharged = amount;
                    akashCostMicroUsd = 0;
                    chargedMicroUsd = 0;
                    awsEquivalentMicroUsd = 0;
                    timestamp = Time.now();
                };
                appendUserUsage(user, rec);
                #ok(())
            };
        }
    };

    // Idempotently bill USD credits for an Akash metering period (authorized bridge/chargers only).
    public shared(msg) func recordUsage(
        idempotencyKey: Text,
        user: Principal,
        service: Text,
        akashCostMicroUsd: Nat,
        awsEquivalentMicroUsd: Nat
    ) : async Result.Result<UsageChargeResult, Text> {
        if (not isAuthorizedCharger(msg.caller)) {
            return #err(ERR_UNAUTHORIZED_CHARGER);
        };
        if (idempotencyKey.size() == 0 or idempotencyKey.size() > MAX_KEY_LEN) {
            return #err("Idempotency key must be 1-128 characters");
        };
        if (akashCostMicroUsd == 0) {
            return #err(ERR_ZERO_AMOUNT);
        };
        // Replay protection: if this metering period was already billed, return without charging twice.
        if (textOps.contains(recordedUsageKeys, idempotencyKey)) {
            let remaining = switch (principalOps.get(accounts, user)) {
                case (?acc) { acc.creditsMicroUsd };
                case null { 0 };
            };
            return #ok({
                remainingCreditsMicroUsd = remaining;
                exhausted = remaining == 0;
                duplicate = true;
            });
        };
        let account = switch (principalOps.get(accounts, user)) {
            case null { return #err(ERR_ACCOUNT_NOT_FOUND); };
            case (?acc) { acc };
        };
        let chargedMicroUsd = (akashCostMicroUsd * (BPS_DENOMINATOR + markupBps)) / BPS_DENOMINATOR;
        let actualDebit = if (account.creditsMicroUsd >= chargedMicroUsd) {
            chargedMicroUsd
        } else {
            account.creditsMicroUsd
        };
        let remaining : Nat = account.creditsMicroUsd - actualDebit;
        let updated : Account = {
            account with
            creditsMicroUsd = remaining;
            spentMicroUsd = account.spentMicroUsd + actualDebit;
            awsEquivalentMicroUsd = account.awsEquivalentMicroUsd + awsEquivalentMicroUsd;
        };
        accounts := principalOps.put(accounts, user, updated);

        let rec : UsageRecord = {
            idempotencyKey = idempotencyKey;
            owner = user;
            service = service;
            cyclesCharged = 0;
            akashCostMicroUsd = akashCostMicroUsd;
            chargedMicroUsd = actualDebit;
            awsEquivalentMicroUsd = awsEquivalentMicroUsd;
            timestamp = Time.now();
        };
        recordedUsageKeys := textOps.put(recordedUsageKeys, idempotencyKey, rec);
        appendUserUsage(user, rec);

        #ok({
            remainingCreditsMicroUsd = remaining;
            exhausted = remaining == 0 or actualDebit < chargedMicroUsd;
            duplicate = false;
        })
    };

    // Check cycles balance (owner or controller only — fixes balance privacy leak).
    public shared query(msg) func getBalance(user: Principal) : async Result.Result<Nat, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        if (not Principal.equal(msg.caller, user) and not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_AUTHORIZED);
        };
        switch (principalOps.get(accounts, user)) {
            case (?account) { #ok(account.balance) };
            case null { #ok(0) };
        }
    };

    // Get caller's full account details.
    public shared query(msg) func getAccount() : async ?Account {
        if (Principal.isAnonymous(msg.caller)) {
            return null;
        };
        principalOps.get(accounts, msg.caller)
    };

    // Get caller's recorded usage ledger.
    public shared query(msg) func listUsage() : async [UsageRecord] {
        if (Principal.isAnonymous(msg.caller)) {
            return [];
        };
        switch (principalOps.get(userUsageHistory, msg.caller)) {
            case (?records) { records };
            case null { [] };
        }
    };

    // Compute caller's cumulative savings vs AWS on-demand baseline.
    public shared query(msg) func getSavingsSummary() : async Result.Result<SavingsSummary, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        let acc = switch (principalOps.get(accounts, msg.caller)) {
            case (?a) { a };
            case null { emptyAccount(msg.caller) };
        };
        let saved : Nat = if (acc.awsEquivalentMicroUsd >= acc.spentMicroUsd) {
            acc.awsEquivalentMicroUsd - acc.spentMicroUsd
        } else {
            0
        };
        #ok({
            remainingCreditsMicroUsd = acc.creditsMicroUsd;
            spentMicroUsd = acc.spentMicroUsd;
            awsEquivalentMicroUsd = acc.awsEquivalentMicroUsd;
            savedMicroUsd = saved;
            markupBps = markupBps;
        })
    };

    // Get current cycle price reference (public read).
    public query func getCyclePrice() : async CyclePrice {
        {
            cyclesPerICP = cyclesPerICP;
            microUsdPerTrillionCycles = microUsdPerTrillionCycles;
        }
    };

    // Get current platform markup in basis points (public for transparent quoting).
    public query func getMarkupBps() : async Nat {
        markupBps
    };

    // Aggregate platform billing metrics (controllers only).
    public shared query(msg) func getPlatformStats() : async Result.Result<{
        accounts: Nat;
        totalCycles: Nat;
        totalCreditsMicroUsd: Nat;
        totalSpentMicroUsd: Nat;
    }, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        var totalCycles : Nat = 0;
        var totalCredits : Nat = 0;
        var totalSpent : Nat = 0;
        for ((_, account) in principalOps.entries(accounts)) {
            totalCycles += account.balance;
            totalCredits += account.creditsMicroUsd;
            totalSpent += account.spentMicroUsd;
        };
        #ok({
            accounts = principalOps.size(accounts);
            totalCycles = totalCycles;
            totalCreditsMicroUsd = totalCredits;
            totalSpentMicroUsd = totalSpent;
        })
    };
}
