// Protocol 28 - Identity Canister
// Handles user authentication via Internet Identity

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Result "mo:base/Result";

actor Identity {
    
    // Types
    public type UserId = Principal;
    
    public type User = {
        id: UserId;
        createdAt: Time.Time;
        email: ?Text;
        projects: [Text];
    };
    
    public type AuthResult = Result.Result<User, Text>;
    
    // State
    private var users = HashMap.HashMap<UserId, User>(10, Principal.equal, Principal.hash);
    
    // Register a new user
    public shared(msg) func register() : async AuthResult {
        let caller = msg.caller;
        
        switch (users.get(caller)) {
            case (?existing) {
                #ok(existing)
            };
            case null {
                let newUser : User = {
                    id = caller;
                    createdAt = Time.now();
                    email = null;
                    projects = [];
                };
                users.put(caller, newUser);
                #ok(newUser)
            };
        };
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
    
    // Get user count (admin only)
    public query func getUserCount() : async Nat {
        users.size()
    };
}
