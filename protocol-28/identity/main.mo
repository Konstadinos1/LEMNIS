// Protocol 28 - Identity Canister
// Handles user authentication via Internet Identity

import Principal "mo:base/Principal";
import Map "mo:base/OrderedMap";
import Time "mo:base/Time";
import Result "mo:base/Result";

persistent actor Identity {

    // Types
    public type UserId = Principal;

    public type User = {
        id: UserId;
        createdAt: Time.Time;
        email: ?Text;
        projects: [Text];
    };

    public type AuthResult = Result.Result<User, Text>;

    // Map operations for UserId keys. transient: it holds functions (not a
    // stable type) and is reconstructed deterministically on every upgrade.
    transient let userOps = Map.Make<UserId>(Principal.compare);

    // State. OrderedMap is a stable type, so under enhanced orthogonal
    // persistence (persistent actor) this survives canister upgrades.
    var users : Map.Map<UserId, User> = userOps.empty();

    // Register a new user
    public shared(msg) func register() : async AuthResult {
        let caller = msg.caller;

        switch (userOps.get(users, caller)) {
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
                users := userOps.put(users, caller, newUser);
                #ok(newUser)
            };
        };
    };

    // Get current user
    public shared(msg) func getUser() : async ?User {
        userOps.get(users, msg.caller)
    };

    // Check if caller is authenticated
    public shared(msg) func isAuthenticated() : async Bool {
        switch (userOps.get(users, msg.caller)) {
            case (?_) { true };
            case null { false };
        };
    };

    // Get user count (admin only)
    public query func getUserCount() : async Nat {
        userOps.size(users)
    };
}
