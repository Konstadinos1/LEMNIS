// Protocol 28 - Identity & IAM Canister
// Manages Internet Identity principals, organizations, role-based access, and CLI link codes.

import Array "mo:base/Array";
import Char "mo:base/Char";
import Nat "mo:base/Nat";
import Map "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";

persistent actor Identity {

    // Public Types
    public type UserId = Principal;
    public type OrgId = Text;

    public type Role = {
        #owner;
        #developer;
        #viewer;
    };

    public type User = {
        id: UserId;
        createdAt: Time.Time;
        email: ?Text;
        projects: [Text];
    };

    public type Organization = {
        id: OrgId;
        name: Text;
        owner: UserId;
        members: [(UserId, Role)];
        createdAt: Time.Time;
    };

    public type LinkCodeRecord = {
        orgId: OrgId;
        role: Role;
        createdBy: UserId;
        expiresAt: Time.Time;
    };

    public type AuthResult = Result.Result<User, Text>;

    // Named limits & error messages.
    // transient: in a persistent actor a plain `let` is stable, so future edits
    // would be ignored on canister upgrade unless marked transient.
    transient let MAX_PROJECTS_PER_USER : Nat = 50;
    transient let MAX_ORGS_PER_USER : Nat = 10;
    transient let MAX_MEMBERS_PER_ORG : Nat = 100;
    transient let MIN_SLUG_LEN : Nat = 3;
    transient let MAX_SLUG_LEN : Nat = 63;
    transient let MIN_ORG_NAME_LEN : Nat = 2;
    transient let MAX_ORG_NAME_LEN : Nat = 64;
    transient let MAX_EMAIL_LEN : Nat = 254;
    transient let MIN_LINK_CODE_LEN : Nat = 16;
    transient let MAX_LINK_CODE_LEN : Nat = 128;
    transient let LINK_CODE_TTL_NS : Int = 600_000_000_000; // 10 minutes

    transient let ERR_ANONYMOUS : Text = "Anonymous principal is not permitted";
    transient let ERR_NOT_CONTROLLER : Text = "Unauthorized: controller privileges required";
    transient let ERR_NOT_REGISTERED : Text = "User is not registered";
    transient let ERR_INVALID_SLUG : Text = "Invalid slug: use 3-63 lowercase alphanumeric characters or hyphens";
    transient let ERR_INVALID_EMAIL : Text = "Invalid email format";
    transient let ERR_INVALID_ORG_NAME : Text = "Organization name must be 2-64 characters";
    transient let ERR_ORG_NOT_FOUND : Text = "Organization not found";
    transient let ERR_NOT_AUTHORIZED : Text = "Not authorized";
    transient let ERR_QUOTA_EXCEEDED : Text = "Resource quota exceeded";
    transient let ERR_INVALID_CODE : Text = "Invalid or expired link code";

    // Map operations (transient because function records are non-stable).
    transient let userOps = Map.Make<UserId>(Principal.compare);
    transient let textOps = Map.Make<Text>(Text.compare);

    // Persisted state under enhanced orthogonal persistence.
    var users : Map.Map<UserId, User> = userOps.empty();
    var organizations : Map.Map<OrgId, Organization> = textOps.empty();
    var linkCodes : Map.Map<Text, LinkCodeRecord> = textOps.empty();
    var orgCounter : Nat = 0;

    // Validate lowercase DNS-style slugs to prevent delimiter or injection bugs.
    func isValidSlug(value: Text) : Bool {
        let len = value.size();
        if (len < MIN_SLUG_LEN or len > MAX_SLUG_LEN) {
            return false;
        };
        var idx : Nat = 0;
        for (c in value.chars()) {
            let isLower = c >= 'a' and c <= 'z';
            let isDigit = c >= '0' and c <= '9';
            let isHyphen = c == '-';
            if (not (isLower or isDigit or isHyphen)) {
                return false;
            };
            if (isHyphen and (idx == 0 or idx + 1 == len)) {
                return false;
            };
            idx += 1;
        };
        true
    };

    func isValidEmail(email: Text) : Bool {
        let len = email.size();
        if (len < 3 or len > MAX_EMAIL_LEN) {
            return false;
        };
        var hasAt = false;
        var hasSpace = false;
        for (c in email.chars()) {
            if (c == '@') { hasAt := true; };
            if (Char.isWhitespace(c)) { hasSpace := true; };
        };
        hasAt and (not hasSpace)
    };

    func findMemberRole(org: Organization, member: UserId) : ?Role {
        for ((p, r) in org.members.vals()) {
            if (Principal.equal(p, member)) {
                return ?r;
            };
        };
        null
    };

    func isOrgOwner(org: Organization, caller: UserId) : Bool {
        switch (findMemberRole(org, caller)) {
            case (?#owner) { true };
            case _ { false };
        }
    };

    func countUserOrgs(caller: UserId) : Nat {
        var count : Nat = 0;
        for ((_, org) in textOps.entries(organizations)) {
            if (Principal.equal(org.owner, caller)) {
                count += 1;
            };
        };
        count
    };

    func countOrgOwners(org: Organization) : Nat {
        var count : Nat = 0;
        for ((_, role) in org.members.vals()) {
            switch (role) {
                case (#owner) { count += 1; };
                case _ {};
            };
        };
        count
    };

    // Register a new authenticated user (idempotent for existing users).
    public shared(msg) func register() : async AuthResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (userOps.get(users, msg.caller)) {
            case (?existing) { #ok(existing) };
            case null {
                let newUser : User = {
                    id = msg.caller;
                    createdAt = Time.now();
                    email = null;
                    projects = [];
                };
                users := userOps.put(users, msg.caller, newUser);
                #ok(newUser)
            };
        }
    };

    // Update caller's optional contact email.
    public shared(msg) func updateEmail(email: ?Text) : async AuthResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (email) {
            case (?addr) {
                if (not isValidEmail(addr)) {
                    return #err(ERR_INVALID_EMAIL);
                };
            };
            case null {};
        };
        switch (userOps.get(users, msg.caller)) {
            case null { #err(ERR_NOT_REGISTERED) };
            case (?existing) {
                let updated : User = { existing with email = email };
                users := userOps.put(users, msg.caller, updated);
                #ok(updated)
            };
        }
    };

    // Attach a validated project slug to the caller's profile.
    public shared(msg) func addProject(projectSlug: Text) : async AuthResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        if (not isValidSlug(projectSlug)) {
            return #err(ERR_INVALID_SLUG);
        };
        switch (userOps.get(users, msg.caller)) {
            case null { #err(ERR_NOT_REGISTERED) };
            case (?existing) {
                for (p in existing.projects.vals()) {
                    if (p == projectSlug) {
                        return #err("Project already exists on user profile");
                    };
                };
                if (existing.projects.size() >= MAX_PROJECTS_PER_USER) {
                    return #err(ERR_QUOTA_EXCEEDED);
                };
                let updated : User = {
                    existing with
                    projects = Array.append(existing.projects, [projectSlug]);
                };
                users := userOps.put(users, msg.caller, updated);
                #ok(updated)
            };
        }
    };

    // Get current authenticated user profile.
    public shared query(msg) func getUser() : async ?User {
        if (Principal.isAnonymous(msg.caller)) {
            return null;
        };
        userOps.get(users, msg.caller)
    };

    // Check whether caller is a registered, non-anonymous user.
    public shared query(msg) func isAuthenticated() : async Bool {
        if (Principal.isAnonymous(msg.caller)) {
            return false;
        };
        switch (userOps.get(users, msg.caller)) {
            case (?_) { true };
            case null { false };
        }
    };

    // Create a new Organization (billing & IAM boundary).
    public shared(msg) func createOrganization(name: Text) : async Result.Result<Organization, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        let len = name.size();
        if (len < MIN_ORG_NAME_LEN or len > MAX_ORG_NAME_LEN) {
            return #err(ERR_INVALID_ORG_NAME);
        };
        if (countUserOrgs(msg.caller) >= MAX_ORGS_PER_USER) {
            return #err(ERR_QUOTA_EXCEEDED);
        };
        let id = "org-" # Nat.toText(orgCounter);
        orgCounter += 1;
        let org : Organization = {
            id = id;
            name = name;
            owner = msg.caller;
            members = [(msg.caller, #owner)];
            createdAt = Time.now();
        };
        organizations := textOps.put(organizations, id, org);
        #ok(org)
    };

    // List organizations that the caller belongs to.
    public shared query(msg) func listMyOrganizations() : async [Organization] {
        if (Principal.isAnonymous(msg.caller)) {
            return [];
        };
        var result : [Organization] = [];
        for ((_, org) in textOps.entries(organizations)) {
            switch (findMemberRole(org, msg.caller)) {
                case (?_) { result := Array.append(result, [org]); };
                case null {};
            };
        };
        result
    };

    // Fetch an organization if the caller is a member or canister controller.
    public shared query(msg) func getOrganization(orgId: OrgId) : async Result.Result<Organization, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(organizations, orgId)) {
            case null { #err(ERR_ORG_NOT_FOUND) };
            case (?org) {
                let allowed = Principal.isController(msg.caller) or (findMemberRole(org, msg.caller) != null);
                if (not allowed) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                #ok(org)
            };
        }
    };

    // Add a member or update their role within an organization (org owners only).
    public shared(msg) func setMemberRole(
        orgId: OrgId,
        member: UserId,
        role: Role
    ) : async Result.Result<Organization, Text> {
        if (Principal.isAnonymous(msg.caller) or Principal.isAnonymous(member)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(organizations, orgId)) {
            case null { #err(ERR_ORG_NOT_FOUND) };
            case (?org) {
                if (not isOrgOwner(org, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                let existingRole = findMemberRole(org, member);
                if (existingRole == null and org.members.size() >= MAX_MEMBERS_PER_ORG) {
                    return #err(ERR_QUOTA_EXCEEDED);
                };
                // Guard against removing the last owner from an organization.
                switch (existingRole, role) {
                    case (?#owner, #developer) {
                        if (countOrgOwners(org) <= 1) { return #err("Cannot demote the last organization owner"); };
                    };
                    case (?#owner, #viewer) {
                        if (countOrgOwners(org) <= 1) { return #err("Cannot demote the last organization owner"); };
                    };
                    case _ {};
                };
                var nextMembers : [(UserId, Role)] = [];
                var replaced = false;
                for ((p, r) in org.members.vals()) {
                    if (Principal.equal(p, member)) {
                        nextMembers := Array.append(nextMembers, [(member, role)]);
                        replaced := true;
                    } else {
                        nextMembers := Array.append(nextMembers, [(p, r)]);
                    };
                };
                if (not replaced) {
                    nextMembers := Array.append(nextMembers, [(member, role)]);
                };
                let updated : Organization = { org with members = nextMembers };
                organizations := textOps.put(organizations, orgId, updated);
                #ok(updated)
            };
        }
    };

    // Remove a member from an organization (org owners only; cannot remove root owner).
    public shared(msg) func removeMember(
        orgId: OrgId,
        member: UserId
    ) : async Result.Result<Organization, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(organizations, orgId)) {
            case null { #err(ERR_ORG_NOT_FOUND) };
            case (?org) {
                if (not isOrgOwner(org, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                if (Principal.equal(org.owner, member)) {
                    return #err("Cannot remove the root organization owner");
                };
                var nextMembers : [(UserId, Role)] = [];
                var found = false;
                for ((p, r) in org.members.vals()) {
                    if (Principal.equal(p, member)) {
                        found := true;
                    } else {
                        nextMembers := Array.append(nextMembers, [(p, r)]);
                    };
                };
                if (not found) {
                    return #err("Member not found in organization");
                };
                let updated : Organization = { org with members = nextMembers };
                organizations := textOps.put(organizations, orgId, updated);
                #ok(updated)
            };
        }
    };

    // Register a one-time link/invite code (generated with >=128 bits of entropy client-side).
    public shared(msg) func createLinkCode(
        orgId: OrgId,
        role: Role,
        code: Text
    ) : async Result.Result<Time.Time, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        let len = code.size();
        if (len < MIN_LINK_CODE_LEN or len > MAX_LINK_CODE_LEN) {
            return #err("Link code must be 16-128 characters");
        };
        switch (textOps.get(organizations, orgId)) {
            case null { #err(ERR_ORG_NOT_FOUND) };
            case (?org) {
                if (not isOrgOwner(org, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                if (textOps.contains(linkCodes, code)) {
                    return #err("Link code already active");
                };
                let expiresAt = Time.now() + LINK_CODE_TTL_NS;
                let record : LinkCodeRecord = {
                    orgId = orgId;
                    role = role;
                    createdBy = msg.caller;
                    expiresAt = expiresAt;
                };
                linkCodes := textOps.put(linkCodes, code, record);
                #ok(expiresAt)
            };
        }
    };

    // Redeem a one-time link code to join an organization (links CLI principal or teammate).
    public shared(msg) func redeemLinkCode(code: Text) : async Result.Result<Organization, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(linkCodes, code)) {
            case null { #err(ERR_INVALID_CODE) };
            case (?record) {
                // Always consume the code immediately to prevent replay attacks.
                linkCodes := textOps.delete(linkCodes, code);
                if (Time.now() > record.expiresAt) {
                    return #err(ERR_INVALID_CODE);
                };
                switch (textOps.get(organizations, record.orgId)) {
                    case null { #err(ERR_ORG_NOT_FOUND) };
                    case (?org) {
                        if (findMemberRole(org, msg.caller) != null) {
                            return #ok(org);
                        };
                        if (org.members.size() >= MAX_MEMBERS_PER_ORG) {
                            return #err(ERR_QUOTA_EXCEEDED);
                        };
                        let updated : Organization = {
                            org with
                            members = Array.append(org.members, [(msg.caller, record.role)]);
                        };
                        organizations := textOps.put(organizations, record.orgId, updated);
                        #ok(updated)
                    };
                }
            };
        }
    };

    // Role lookup used by peer Protocol 28 canisters (compute, billing) for IAM enforcement.
    public query func roleOf(orgId: OrgId, principal: UserId) : async ?Role {
        if (Principal.isAnonymous(principal)) {
            return null;
        };
        switch (textOps.get(organizations, orgId)) {
            case null { null };
            case (?org) { findMemberRole(org, principal) };
        }
    };

    // Get registered user count (controllers only to prevent user enumeration).
    public shared query(msg) func getUserCount() : async Result.Result<Nat, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        #ok(userOps.size(users))
    };
}
