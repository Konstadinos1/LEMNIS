// Protocol 28 - Market Engine Canister
// DePIN infrastructure token intelligence and dip-buying automation
// Tracks AKT (Akash), RNDR (Render), FIL (Filecoin), AR (Arweave)
// to pre-purchase compute/storage credits at depressed valuations

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Array "mo:base/Array";
import Text "mo:base/Text";
import Int "mo:base/Int";
import Float "mo:base/Float";
import Nat "mo:base/Nat";
import Iter "mo:base/Iter";

actor MarketEngine {

    // ── Types ──────────────────────────────────────────────────────────

    public type InfraToken = {
        #AKT;    // Akash Network - decentralized compute
        #RNDR;   // Render Network - GPU compute
        #FIL;    // Filecoin - decentralized storage
        #AR;     // Arweave - permanent storage
        #SOL;    // Solana - high-speed settlement
        #NOSANA; // Nosana - CI/CD compute
        #IO;     // io.net - GPU aggregator
    };

    public type TokenMetrics = {
        token: InfraToken;
        currentPrice: Nat;       // Micro-USD (6 decimals)
        athPrice: Nat;           // All-time high in micro-USD
        drawdownPct: Nat;        // Percentage below ATH (0-100)
        weeklyVolume: Nat;       // 7d volume in micro-USD
        computeCreditsPerToken: Nat;  // Platform credits per token
        storageGBPerToken: Nat;       // Storage GB purchasable
        lastUpdated: Time.Time;
    };

    public type BuyOpportunity = {
        token: InfraToken;
        currentPrice: Nat;
        targetPrice: Nat;        // DCA target price
        discount: Nat;           // Discount vs ATH (percentage)
        recommendedAllocation: Nat; // Micro-USD allocation
        rationale: Text;
        confidence: OpportunityConfidence;
        timestamp: Time.Time;
    };

    public type OpportunityConfidence = {
        #high;     // >70% drawdown, strong fundamentals
        #medium;   // 50-70% drawdown
        #low;      // <50% drawdown
    };

    public type CreditReserve = {
        token: InfraToken;
        tokensHeld: Nat;           // Raw token amount
        avgBuyPrice: Nat;          // Avg purchase price micro-USD
        currentValue: Nat;         // Current value micro-USD
        computeCredits: Nat;       // Redeemable compute credits
        storageCredits: Nat;       // Redeemable storage GB
        purchasedAt: Time.Time;
    };

    public type DCAOrder = {
        id: Text;
        owner: Principal;
        token: InfraToken;
        totalBudget: Nat;          // Total micro-USD to deploy
        spent: Nat;                // micro-USD spent so far
        frequency: DCAFrequency;
        maxPrice: Nat;             // Only buy below this price
        active: Bool;
        createdAt: Time.Time;
        lastExecuted: ?Time.Time;
    };

    public type DCAFrequency = {
        #hourly;
        #daily;
        #weekly;
    };

    // ── State ──────────────────────────────────────────────────────────

    private var metrics = HashMap.HashMap<Text, TokenMetrics>(10, Text.equal, Text.hash);
    private var opportunities = HashMap.HashMap<Text, BuyOpportunity>(20, Text.equal, Text.hash);
    private var reserves = HashMap.HashMap<Text, CreditReserve>(20, Text.equal, Text.hash);
    private var dcaOrders = HashMap.HashMap<Text, DCAOrder>(50, Text.equal, Text.hash);
    private var dcaCounter : Nat = 0;

    // ATH reference prices (micro-USD) for drawdown calculation
    private let athPrices : [(Text, Nat)] = [
        ("AKT",    8_490_000),     // ATH ~$8.49
        ("RNDR",   13_600_000),    // ATH ~$13.60
        ("FIL",    236_840_000),   // ATH ~$236.84
        ("AR",     90_000_000),    // ATH ~$90.00
        ("SOL",    259_960_000),   // ATH ~$259.96
        ("NOSANA", 18_500_000),    // ATH ~$18.50
        ("IO",     6_400_000),     // ATH ~$6.40
    ];

    // ── Price Feed & Metrics ───────────────────────────────────────────

    // Update token price - called by oracle relayer
    public shared(msg) func updateTokenMetrics(
        tokenSymbol: Text,
        currentPrice: Nat,
        weeklyVolume: Nat
    ) : async Result.Result<TokenMetrics, Text> {
        let token = _parseToken(tokenSymbol);
        switch (token) {
            case null { return #err("Unsupported token: " # tokenSymbol) };
            case (?t) {
                let ath = _getATH(tokenSymbol);
                let drawdown = if (ath > 0) { ((ath - currentPrice) * 100) / ath } else { 0 };

                // Calculate infrastructure value per token
                let computeCredits = _computeCreditsPerToken(tokenSymbol, currentPrice);
                let storageGB = _storagePerToken(tokenSymbol, currentPrice);

                let m : TokenMetrics = {
                    token = t;
                    currentPrice = currentPrice;
                    athPrice = ath;
                    drawdownPct = drawdown;
                    weeklyVolume = weeklyVolume;
                    computeCreditsPerToken = computeCredits;
                    storageGBPerToken = storageGB;
                    lastUpdated = Time.now();
                };

                metrics.put(tokenSymbol, m);

                // Auto-generate opportunity if deep discount
                if (drawdown >= 50) {
                    _generateOpportunity(tokenSymbol, m);
                };

                #ok(m)
            };
        };
    };

    // Get all current metrics
    public query func getAllMetrics() : async [TokenMetrics] {
        var result : [TokenMetrics] = [];
        for ((_, m) in metrics.entries()) {
            result := Array.append(result, [m]);
        };
        result
    };

    // Get specific token metrics
    public query func getTokenMetrics(symbol: Text) : async ?TokenMetrics {
        metrics.get(symbol)
    };

    // ── Opportunity Detection ──────────────────────────────────────────

    // Get all active buy opportunities (tokens trading at deep discounts)
    public query func getOpportunities() : async [BuyOpportunity] {
        var result : [BuyOpportunity] = [];
        for ((_, opp) in opportunities.entries()) {
            result := Array.append(result, [opp]);
        };
        result
    };

    // Get best opportunity right now
    public query func getBestOpportunity() : async ?BuyOpportunity {
        var best : ?BuyOpportunity = null;
        var bestDiscount : Nat = 0;

        for ((_, opp) in opportunities.entries()) {
            if (opp.discount > bestDiscount) {
                bestDiscount := opp.discount;
                best := ?opp;
            };
        };

        best
    };

    // ── DCA (Dollar Cost Average) Orders ───────────────────────────────

    // Create a DCA order to accumulate infra tokens during dips
    public shared(msg) func createDCAOrder(
        tokenSymbol: Text,
        totalBudget: Nat,
        frequency: DCAFrequency,
        maxPrice: Nat
    ) : async Result.Result<DCAOrder, Text> {

        let token = _parseToken(tokenSymbol);
        switch (token) {
            case null { return #err("Unsupported token") };
            case (?t) {
                let orderId = "dca-" # Nat.toText(dcaCounter);
                dcaCounter += 1;

                let order : DCAOrder = {
                    id = orderId;
                    owner = msg.caller;
                    token = t;
                    totalBudget = totalBudget;
                    spent = 0;
                    frequency = frequency;
                    maxPrice = maxPrice;
                    active = true;
                    createdAt = Time.now();
                    lastExecuted = null;
                };

                dcaOrders.put(orderId, order);
                #ok(order)
            };
        };
    };

    // List user's DCA orders
    public shared(msg) func listDCAOrders() : async [DCAOrder] {
        let caller = msg.caller;
        var result : [DCAOrder] = [];

        for ((_, order) in dcaOrders.entries()) {
            if (Principal.equal(order.owner, caller)) {
                result := Array.append(result, [order]);
            };
        };

        result
    };

    // Cancel a DCA order
    public shared(msg) func cancelDCA(orderId: Text) : async Result.Result<(), Text> {
        switch (dcaOrders.get(orderId)) {
            case null { #err("Order not found") };
            case (?order) {
                if (not Principal.equal(order.owner, msg.caller)) {
                    return #err("Not authorized");
                };
                let updated = { order with active = false };
                dcaOrders.put(orderId, updated);
                #ok(())
            };
        };
    };

    // ── Credit Reserves (Pre-purchased Infra Credits) ──────────────────

    // Record a token purchase that converts to platform credits
    public shared(msg) func recordCreditPurchase(
        tokenSymbol: Text,
        tokensAcquired: Nat,
        pricePerToken: Nat
    ) : async Result.Result<CreditReserve, Text> {

        let token = _parseToken(tokenSymbol);
        switch (token) {
            case null { return #err("Unsupported token") };
            case (?t) {
                let computeCredits = _computeCreditsPerToken(tokenSymbol, pricePerToken) * tokensAcquired;
                let storageCredits = _storagePerToken(tokenSymbol, pricePerToken) * tokensAcquired;

                let reserve : CreditReserve = {
                    token = t;
                    tokensHeld = tokensAcquired;
                    avgBuyPrice = pricePerToken;
                    currentValue = tokensAcquired * pricePerToken;
                    computeCredits = computeCredits;
                    storageCredits = storageCredits;
                    purchasedAt = Time.now();
                };

                let key = Principal.toText(msg.caller) # "-" # tokenSymbol;
                reserves.put(key, reserve);
                #ok(reserve)
            };
        };
    };

    // Get user's credit reserves
    public shared(msg) func getReserves() : async [CreditReserve] {
        let callerPrefix = Principal.toText(msg.caller);
        var result : [CreditReserve] = [];

        for ((key, reserve) in reserves.entries()) {
            if (Text.startsWith(key, #text callerPrefix)) {
                result := Array.append(result, [reserve]);
            };
        };

        result
    };

    // ── Platform Analytics ─────────────────────────────────────────────

    public query func getMarketSummary() : async {
        trackedTokens: Nat;
        activeOpportunities: Nat;
        activeDCAOrders: Nat;
        avgDrawdown: Nat;
    } {
        var totalDrawdown : Nat = 0;
        var count : Nat = 0;

        for ((_, m) in metrics.entries()) {
            totalDrawdown += m.drawdownPct;
            count += 1;
        };

        let avgDD = if (count > 0) { totalDrawdown / count } else { 0 };

        var activeOrders : Nat = 0;
        for ((_, order) in dcaOrders.entries()) {
            if (order.active) { activeOrders += 1 };
        };

        {
            trackedTokens = metrics.size();
            activeOpportunities = opportunities.size();
            activeDCAOrders = activeOrders;
            avgDrawdown = avgDD;
        }
    };

    // ── Private Helpers ────────────────────────────────────────────────

    private func _parseToken(symbol: Text) : ?InfraToken {
        switch (symbol) {
            case ("AKT") { ?#AKT };
            case ("RNDR") { ?#RNDR };
            case ("FIL") { ?#FIL };
            case ("AR") { ?#AR };
            case ("SOL") { ?#SOL };
            case ("NOSANA") { ?#NOSANA };
            case ("IO") { ?#IO };
            case (_) { null };
        };
    };

    private func _getATH(symbol: Text) : Nat {
        for ((s, price) in athPrices.vals()) {
            if (s == symbol) { return price };
        };
        0
    };

    // How many compute hours 1 token buys at current price
    private func _computeCreditsPerToken(symbol: Text, price: Nat) : Nat {
        switch (symbol) {
            case ("AKT") { price / 18_000 };     // Akash vCPU @ $0.018/hr
            case ("RNDR") { price / 1_400_000 };  // GPU render @ $1.40/hr
            case ("IO") { price / 500_000 };      // io.net GPU @ $0.50/hr
            case ("NOSANA") { price / 100_000 };  // CI/CD @ $0.10/hr
            case (_) { 0 };
        };
    };

    // How many GB of storage 1 token buys at current price
    private func _storagePerToken(symbol: Text, price: Nat) : Nat {
        switch (symbol) {
            case ("FIL") { price / 50_000 };     // Filecoin @ $0.05/GB/mo
            case ("AR") { price / 6_000_000 };   // Arweave @ $6/GB permanent
            case (_) { 0 };
        };
    };

    private func _generateOpportunity(symbol: Text, m: TokenMetrics) {
        let confidence = if (m.drawdownPct >= 70) { #high }
                        else if (m.drawdownPct >= 50) { #medium }
                        else { #low };

        // Recommend larger allocation for deeper discounts
        let allocation = m.drawdownPct * 100_000; // More aggressive at deeper discounts

        let rationale = symbol # " is " # Nat.toText(m.drawdownPct) #
            "% below ATH. Infrastructure demand is growing while token price is depressed. " #
            "Each token buys " # Nat.toText(m.computeCreditsPerToken) # " compute hrs or " #
            Nat.toText(m.storageGBPerToken) # " GB storage at current rates.";

        let opp : BuyOpportunity = {
            token = m.token;
            currentPrice = m.currentPrice;
            targetPrice = m.currentPrice * 80 / 100; // Target 20% below current
            discount = m.drawdownPct;
            recommendedAllocation = allocation;
            rationale = rationale;
            confidence = confidence;
            timestamp = Time.now();
        };

        opportunities.put(symbol, opp);
    };
}
