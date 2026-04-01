// Protocol 28 - Identity Canister
// Multi-chain authentication: Internet Identity, Solana (SIWS), Ethereum (SIWE)

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Array "mo:base/Array";
import Text "mo:base/Text";

actor Identity {

    // Types
    public type UserId = Principal;

    public type AuthMethod = {
        #internetIdentity;
        #solanaWallet: Text;   // Base58 Solana pubkey (SIWS)
        #ethereumWallet: Text; // 0x Ethereum address (SIWE)
        #apiKey: Text;         // CI/CD automation key
    };

    public type User = {
        id: UserId;
        createdAt: Time.Time;
        email: ?Text;
        projects: [Text];
        authMethods: [AuthMethod];
        solanaWallet: ?Text;
        ethereumWallet: ?Text;
    };

    public type AuthResult = Result.Result<User, Text>;

    // State
    private var users = HashMap.HashMap<UserId, User>(10, Principal.equal, Principal.hash);
    private var walletIndex = HashMap.HashMap<Text, UserId>(50, Text.equal, Text.hash);

    // Register with Internet Identity (default)
    public shared(msg) func register() : async AuthResult {
        let caller = msg.caller;

        switch (users.get(caller)) {
            case (?existing) { #ok(existing) };
            case null {
                let newUser : User = {
                    id = caller;
                    createdAt = Time.now();
                    email = null;
                    projects = [];
                    authMethods = [#internetIdentity];
                    solanaWallet = null;
                    ethereumWallet = null;
                };
                users.put(caller, newUser);
                #ok(newUser)
            };
        };
    };

    // Link a Solana wallet for SIWS authentication and cross-chain payments
    public shared(msg) func linkSolanaWallet(walletAddress: Text) : async Result.Result<User, Text> {
        if (Text.size(walletAddress) < 32 or Text.size(walletAddress) > 44) {
            return #err("Invalid Solana address format");
        };

        switch (users.get(msg.caller)) {
            case null { #err("User not registered. Call register() first") };
            case (?user) {
                let updated : User = {
                    id = user.id;
                    createdAt = user.createdAt;
                    email = user.email;
                    projects = user.projects;
                    authMethods = Array.append(user.authMethods, [#solanaWallet(walletAddress)]);
                    solanaWallet = ?walletAddress;
                    ethereumWallet = user.ethereumWallet;
                };
                users.put(msg.caller, updated);
                walletIndex.put(walletAddress, msg.caller);
                #ok(updated)
            };
        };
    };

    // Link an Ethereum wallet for SIWE authentication
    public shared(msg) func linkEthereumWallet(walletAddress: Text) : async Result.Result<User, Text> {
        if (Text.size(walletAddress) != 42) {
            return #err("Invalid Ethereum address format");
        };

        switch (users.get(msg.caller)) {
            case null { #err("User not registered") };
            case (?user) {
                let updated : User = {
                    id = user.id;
                    createdAt = user.createdAt;
                    email = user.email;
                    projects = user.projects;
                    authMethods = Array.append(user.authMethods, [#ethereumWallet(walletAddress)]);
                    solanaWallet = user.solanaWallet;
                    ethereumWallet = ?walletAddress;
                };
                users.put(msg.caller, updated);
                walletIndex.put(walletAddress, msg.caller);
                #ok(updated)
            };
        };
    };

    // Resolve user by wallet address (cross-chain lookup)
    public query func resolveWallet(walletAddress: Text) : async ?UserId {
        walletIndex.get(walletAddress)
    };

    // Get current user
    public shared(msg) func getUser() : async ?User {
        users.get(msg.caller)
    };

    // Check if caller is authenticated
    public shared(msg) func isAuthenticated() : async Bool {
        switch (users.get(msg.caller)) {
            case (?_) { true };
            case null { false };
        };
    };

    // Get user count
    public query func getUserCount() : async Nat {
        users.size()
    };

    // Get linked wallet count
    public query func getLinkedWalletCount() : async Nat {
        walletIndex.size()
    };
}
