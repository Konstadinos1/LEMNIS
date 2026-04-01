// Protocol 28 - Solana Bridge Canister
// Multi-chain payment processing via Solana SPL tokens
// Capitalizes on Solana's speed (400ms finality) and low fees ($0.00025/tx)

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Nat64 "mo:base/Nat64";
import Array "mo:base/Array";
import Text "mo:base/Text";
import Int "mo:base/Int";

actor SolanaBridge {

    // ── Types ──────────────────────────────────────────────────────────

    public type SolanaAddress = Text; // Base58 Solana public key
    public type TxSignature = Text;   // Solana transaction signature

    public type SupportedToken = {
        #SOL;
        #USDC;    // EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
        #USDT;    // Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
        #BONK;    // DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
        #JUP;     // JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
    };

    public type PaymentChannel = {
        id: Text;
        user: Principal;
        solanaWallet: SolanaAddress;
        linkedAt: Time.Time;
        totalDeposited: Nat;
        lastTxSignature: ?TxSignature;
    };

    public type DepositRecord = {
        id: Text;
        user: Principal;
        token: SupportedToken;
        amount: Nat;           // In token's smallest unit (lamports, micro-USDC)
        usdValue: Nat;         // In micro-USD (6 decimals)
        solTxSignature: TxSignature;
        creditedCycles: Nat;   // Cycles credited to billing account
        timestamp: Time.Time;
        status: DepositStatus;
    };

    public type DepositStatus = {
        #pending;
        #confirmed;
        #credited;
        #failed: Text;
    };

    public type SwapQuote = {
        inputToken: SupportedToken;
        outputToken: SupportedToken;
        inputAmount: Nat;
        outputAmount: Nat;
        priceImpact: Nat;      // Basis points
        route: Text;           // Jupiter route description
        expiresAt: Time.Time;
    };

    public type TokenPrice = {
        token: SupportedToken;
        usdPrice: Nat;        // Micro-USD (6 decimals)
        lastUpdated: Time.Time;
        source: Text;          // "pyth" | "switchboard" | "jupiter"
    };

    // ── State ──────────────────────────────────────────────────────────

    private var channels = HashMap.HashMap<Principal, PaymentChannel>(50, Principal.equal, Principal.hash);
    private var deposits = HashMap.HashMap<Text, DepositRecord>(200, Text.equal, Text.hash);
    private var depositCounter : Nat = 0;
    private var prices = HashMap.HashMap<Text, TokenPrice>(10, Text.equal, Text.hash);

    // Treasury wallet for receiving payments
    private let treasuryWallet : SolanaAddress = "LMNSwVnmJhQpKgxEFjvMRYbaoUaFcirmuSzfMKR1rTs";

    // ── Wallet Linking ─────────────────────────────────────────────────

    // Link a Solana wallet to ICP principal for cross-chain payments
    public shared(msg) func linkSolanaWallet(walletAddress: SolanaAddress) : async Result.Result<PaymentChannel, Text> {
        if (Text.size(walletAddress) < 32 or Text.size(walletAddress) > 44) {
            return #err("Invalid Solana address format");
        };

        let channel : PaymentChannel = {
            id = "sol-ch-" # Nat.toText(depositCounter);
            user = msg.caller;
            solanaWallet = walletAddress;
            linkedAt = Time.now();
            totalDeposited = 0;
            lastTxSignature = null;
        };

        channels.put(msg.caller, channel);
        #ok(channel)
    };

    // Get linked wallet info
    public shared(msg) func getPaymentChannel() : async ?PaymentChannel {
        channels.get(msg.caller)
    };

    // ── Deposits & Payments ────────────────────────────────────────────

    // Record a deposit from Solana (verified by off-chain relayer)
    public shared(msg) func recordDeposit(
        token: SupportedToken,
        amount: Nat,
        usdValue: Nat,
        txSignature: TxSignature
    ) : async Result.Result<DepositRecord, Text> {

        // Verify caller has linked wallet
        switch (channels.get(msg.caller)) {
            case null { return #err("No Solana wallet linked. Call linkSolanaWallet first") };
            case (?_) {};
        };

        // Calculate cycles to credit: $1 = 10B cycles
        let creditedCycles = usdValue * 10_000; // usdValue in micro-USD, so this gives proper cycles

        let depositId = "dep-" # Nat.toText(depositCounter);
        depositCounter += 1;

        let record : DepositRecord = {
            id = depositId;
            user = msg.caller;
            token = token;
            amount = amount;
            usdValue = usdValue;
            solTxSignature = txSignature;
            creditedCycles = creditedCycles;
            timestamp = Time.now();
            status = #confirmed;
        };

        deposits.put(depositId, record);
        #ok(record)
    };

    // Get deposit history for user
    public shared(msg) func getDeposits() : async [DepositRecord] {
        let caller = msg.caller;
        var result : [DepositRecord] = [];

        for ((_, record) in deposits.entries()) {
            if (Principal.equal(record.user, caller)) {
                result := Array.append(result, [record]);
            };
        };

        result
    };

    // ── Jupiter DEX Integration (Quote Engine) ─────────────────────────

    // Get a swap quote - swap any token to USDC for billing
    // Uses Jupiter aggregator for best rates across Solana DEXes
    public query func getSwapQuote(
        inputToken: SupportedToken,
        outputToken: SupportedToken,
        inputAmount: Nat
    ) : async SwapQuote {
        // Simulated quote - production uses Jupiter API via HTTPS outcalls
        let rate = switch (inputToken) {
            case (#SOL) { 13500 };    // ~$135 per SOL (bear market price)
            case (#BONK) { 1 };       // fractions of a cent
            case (#JUP) { 850 };      // ~$0.85 per JUP
            case (#USDC) { 100_000 }; // $1.00
            case (#USDT) { 100_000 }; // $1.00
        };

        {
            inputToken = inputToken;
            outputToken = outputToken;
            inputAmount = inputAmount;
            outputAmount = inputAmount * rate / 100_000;
            priceImpact = 15; // 0.15% typical
            route = "Jupiter v6 → Raydium → Orca";
            expiresAt = Time.now() + 30_000_000_000; // 30s expiry
        }
    };

    // ── Pyth Oracle Price Feeds ────────────────────────────────────────

    // Update token price from Pyth Network oracle
    // Production: uses ICP HTTPS outcalls to Pyth Hermes API
    public shared(msg) func updatePrice(
        tokenSymbol: Text,
        usdPrice: Nat,
        source: Text
    ) : async Result.Result<(), Text> {
        let token = switch (tokenSymbol) {
            case ("SOL") { #SOL };
            case ("USDC") { #USDC };
            case ("USDT") { #USDT };
            case ("BONK") { #BONK };
            case ("JUP") { #JUP };
            case (_) { return #err("Unsupported token") };
        };

        let price : TokenPrice = {
            token = token;
            usdPrice = usdPrice;
            lastUpdated = Time.now();
            source = source;
        };

        prices.put(tokenSymbol, price);
        #ok(())
    };

    // Get current token price
    public query func getPrice(tokenSymbol: Text) : async ?TokenPrice {
        prices.get(tokenSymbol)
    };

    // ── Treasury & Stats ───────────────────────────────────────────────

    public query func getTreasuryAddress() : async SolanaAddress {
        treasuryWallet
    };

    public query func getBridgeStats() : async {
        linkedWallets: Nat;
        totalDeposits: Nat;
        supportedTokens: [Text];
    } {
        {
            linkedWallets = channels.size();
            totalDeposits = deposits.size();
            supportedTokens = ["SOL", "USDC", "USDT", "BONK", "JUP"];
        }
    };
}
