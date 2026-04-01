// Protocol 28 - Billing Canister
// Multi-chain cycles management with dynamic oracle pricing
// Supports ICP cycles, Solana SPL tokens, and DePIN credit redemption

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Cycles "mo:base/ExperimentalCycles";
import Result "mo:base/Result";
import Nat64 "mo:base/Nat64";
import Array "mo:base/Array";
import Text "mo:base/Text";

actor Billing {

    // Types
    public type PaymentSource = {
        #icpCycles;
        #solanaUSDC;
        #solanaSOL;
        #depinCredits: Text; // Token symbol (AKT, RNDR, FIL, AR)
    };

    public type Account = {
        owner: Principal;
        balance: Nat;
        totalDeposited: Nat;
        totalSpent: Nat;
        createdAt: Time.Time;
        solanaWallet: ?Text;
        depinCredits: [(Text, Nat)]; // [(token_symbol, credit_amount)]
        tier: AccountTier;
    };

    public type AccountTier = {
        #free;
        #indie;   // $9/mo
        #pro;     // $29/mo
        #team;    // $99/mo
    };

    public type UsageRecord = {
        service: Text;
        amount: Nat;
        source: PaymentSource;
        timestamp: Time.Time;
    };

    public type PriceFeed = {
        symbol: Text;
        usdMicro: Nat;       // Price in micro-USD
        cycleRate: Nat;       // Cycles per token unit
        lastUpdated: Time.Time;
        oracleSource: Text;   // "pyth" | "switchboard" | "fixed"
    };
    
    // State
    private var accounts = HashMap.HashMap<Principal, Account>(10, Principal.equal, Principal.hash);
    private var usageHistory = HashMap.HashMap<Text, [UsageRecord]>(100, Text.equal, Text.hash);
    private var priceFeeds = HashMap.HashMap<Text, PriceFeed>(10, Text.equal, Text.hash);

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
                    solanaWallet = null;
                    depinCredits = [];
                    tier = #free;
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
    
    // ── Multi-Chain Pricing ───────────────────────────────────────────

    // Update price feed from oracle (Pyth/Switchboard via HTTPS outcall)
    public shared(msg) func updatePriceFeed(
        symbol: Text,
        usdMicro: Nat,
        source: Text
    ) : async Result.Result<(), Text> {
        let cycleRate = usdMicro * 10_000; // Convert micro-USD to cycle rate

        let feed : PriceFeed = {
            symbol = symbol;
            usdMicro = usdMicro;
            cycleRate = cycleRate;
            lastUpdated = Time.now();
            oracleSource = source;
        };

        priceFeeds.put(symbol, feed);
        #ok(())
    };

    // Get cycle exchange rates for all supported tokens
    public query func getAllPrices() : async [PriceFeed] {
        var result : [PriceFeed] = [];
        for ((_, feed) in priceFeeds.entries()) {
            result := Array.append(result, [feed]);
        };
        result
    };

    public query func getCyclePrice() : async { cyclesPerICP: Nat; usdPerTrillionCycles: Nat } {
        {
            cyclesPerICP = 1_000_000_000_000;
            usdPerTrillionCycles = 100_000;
        }
    };

    // ── DePIN Credit Redemption ────────────────────────────────────────

    // Link Solana wallet to account for cross-chain billing
    public shared(msg) func linkSolanaWallet(walletAddress: Text) : async Result.Result<(), Text> {
        switch (accounts.get(msg.caller)) {
            case null { #err("Account not found") };
            case (?account) {
                let updated : Account = {
                    owner = account.owner;
                    balance = account.balance;
                    totalDeposited = account.totalDeposited;
                    totalSpent = account.totalSpent;
                    createdAt = account.createdAt;
                    solanaWallet = ?walletAddress;
                    depinCredits = account.depinCredits;
                    tier = account.tier;
                };
                accounts.put(msg.caller, updated);
                #ok(())
            };
        };
    };

    // Redeem DePIN tokens as platform credits (from market-engine purchases)
    public shared(msg) func redeemDepinCredits(
        tokenSymbol: Text,
        creditAmount: Nat
    ) : async Result.Result<Nat, Text> {
        switch (accounts.get(msg.caller)) {
            case null { #err("Account not found") };
            case (?account) {
                // Convert DePIN credits to cycles based on current rates
                let cyclesEarned = switch (tokenSymbol) {
                    case ("AKT") { creditAmount * 18_000 };     // 1 AKT credit = 1 vCPU-hr worth
                    case ("RNDR") { creditAmount * 1_400_000 };  // 1 RNDR credit = 1 GPU-hr
                    case ("FIL") { creditAmount * 50_000 };      // 1 FIL credit = 1 GB-mo
                    case ("AR") { creditAmount * 6_000_000 };    // 1 AR credit = 1 GB permanent
                    case (_) { return #err("Unsupported DePIN token") };
                };

                let updated : Account = {
                    owner = account.owner;
                    balance = account.balance + cyclesEarned;
                    totalDeposited = account.totalDeposited + cyclesEarned;
                    totalSpent = account.totalSpent;
                    createdAt = account.createdAt;
                    solanaWallet = account.solanaWallet;
                    depinCredits = account.depinCredits;
                    tier = account.tier;
                };
                accounts.put(msg.caller, updated);
                #ok(cyclesEarned)
            };
        };
    };

    // Upgrade account tier
    public shared(msg) func upgradeTier(newTier: AccountTier) : async Result.Result<(), Text> {
        switch (accounts.get(msg.caller)) {
            case null { #err("Account not found") };
            case (?account) {
                let updated : Account = {
                    owner = account.owner;
                    balance = account.balance;
                    totalDeposited = account.totalDeposited;
                    totalSpent = account.totalSpent;
                    createdAt = account.createdAt;
                    solanaWallet = account.solanaWallet;
                    depinCredits = account.depinCredits;
                    tier = newTier;
                };
                accounts.put(msg.caller, updated);
                #ok(())
            };
        };
    };

    // ── Platform Stats ─────────────────────────────────────────────────

    public query func getPlatformStats() : async {
        accounts: Nat;
        totalCycles: Nat;
        priceFeedsActive: Nat;
    } {
        var total : Nat = 0;
        for ((_, account) in accounts.entries()) {
            total += account.balance;
        };
        {
            accounts = accounts.size();
            totalCycles = total;
            priceFeedsActive = priceFeeds.size();
        }
    };
}
