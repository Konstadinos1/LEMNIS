// Protocol 28 - Database Canister
// Owner-isolated Key-Value store with nested per-table maps and accurate metadata.

import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Map "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";

persistent actor Database {

    // Public Types
    public type TableName = Text;
    public type RecordId = Text;

    public type Record = {
        id: RecordId;
        data: [(Text, Text)]; // Key-value pairs
        createdAt: Time.Time;
        updatedAt: Time.Time;
    };

    public type Table = {
        name: TableName;
        owner: Principal;
        recordCount: Nat;
        createdAt: Time.Time;
    };

    // Named constants & error strings (transient so edits apply across upgrades).
    transient let MIN_TABLE_NAME_LEN : Nat = 3;
    transient let MAX_TABLE_NAME_LEN : Nat = 63;
    transient let MAX_TABLES_PER_OWNER : Nat = 25;
    transient let MAX_RECORDS_PER_TABLE : Nat = 5_000;
    transient let MAX_FIELDS_PER_RECORD : Nat = 64;
    transient let MAX_FIELD_LEN : Nat = 4_096;

    transient let ERR_ANONYMOUS : Text = "Anonymous principal is not permitted";
    transient let ERR_NOT_AUTHORIZED : Text = "Not authorized";
    transient let ERR_NOT_CONTROLLER : Text = "Unauthorized: controller privileges required";
    transient let ERR_TABLE_NOT_FOUND : Text = "Table not found";
    transient let ERR_RECORD_NOT_FOUND : Text = "Record not found";
    transient let ERR_INVALID_TABLE_NAME : Text = "Table name must be 3-63 lowercase alphanumeric chars, '_' or '-'";
    transient let ERR_QUOTA_EXCEEDED : Text = "Database quota exceeded";

    // Map operations (transient: function records are non-stable).
    transient let textOps = Map.Make<Text>(Text.compare);

    // Persisted state. Nested per-table map structurally eliminates cross-table prefix collisions.
    var tables : Map.Map<TableName, Table> = textOps.empty();
    var tableRecords : Map.Map<TableName, Map.Map<RecordId, Record>> = textOps.empty();
    var recordCounters : Map.Map<TableName, Nat> = textOps.empty();

    func isValidTableName(name: Text) : Bool {
        let len = name.size();
        if (len < MIN_TABLE_NAME_LEN or len > MAX_TABLE_NAME_LEN) {
            return false;
        };
        for (c in name.chars()) {
            let isLower = c >= 'a' and c <= 'z';
            let isDigit = c >= '0' and c <= '9';
            let isSep = c == '_' or c == '-';
            if (not (isLower or isDigit or isSep)) {
                return false;
            };
        };
        true
    };

    func validateRecordData(data: [(Text, Text)]) : ?Text {
        if (data.size() > MAX_FIELDS_PER_RECORD) {
            return ?"Record exceeds maximum of 64 fields";
        };
        for ((k, v) in data.vals()) {
            if (k.size() == 0 or k.size() > MAX_FIELD_LEN or v.size() > MAX_FIELD_LEN) {
                return ?"Field keys must be non-empty and keys/values must be <= 4096 chars";
            };
        };
        null
    };

    func countOwnerTables(owner: Principal) : Nat {
        var count : Nat = 0;
        for ((_, t) in textOps.entries(tables)) {
            if (Principal.equal(t.owner, owner)) {
                count += 1;
            };
        };
        count
    };

    func authorizeTable(tableName: TableName, caller: Principal, allowController: Bool) : Result.Result<Table, Text> {
        if (Principal.isAnonymous(caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(tables, tableName)) {
            case null { #err(ERR_TABLE_NOT_FOUND) };
            case (?table) {
                let isOwner = Principal.equal(table.owner, caller);
                let isAdmin = allowController and Principal.isController(caller);
                if (not (isOwner or isAdmin)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                #ok(table)
            };
        }
    };

    // Create an owner-isolated table.
    public shared(msg) func createTable(name: TableName) : async Result.Result<Table, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        if (not isValidTableName(name)) {
            return #err(ERR_INVALID_TABLE_NAME);
        };
        if (textOps.contains(tables, name)) {
            return #err("Table already exists");
        };
        if (countOwnerTables(msg.caller) >= MAX_TABLES_PER_OWNER) {
            return #err(ERR_QUOTA_EXCEEDED);
        };

        let table : Table = {
            name = name;
            owner = msg.caller;
            recordCount = 0;
            createdAt = Time.now();
        };
        tables := textOps.put(tables, name, table);
        tableRecords := textOps.put(tableRecords, name, textOps.empty());
        recordCounters := textOps.put(recordCounters, name, 0);
        #ok(table)
    };

    // List tables owned by caller.
    public shared query(msg) func listTables() : async [Table] {
        if (Principal.isAnonymous(msg.caller)) {
            return [];
        };
        var result : [Table] = [];
        for ((_, table) in textOps.entries(tables)) {
            if (Principal.equal(table.owner, msg.caller)) {
                result := Array.append(result, [table]);
            };
        };
        result
    };

    // Delete a table and all its records (owner only).
    public shared(msg) func deleteTable(name: TableName) : async Result.Result<(), Text> {
        switch (authorizeTable(name, msg.caller, false)) {
            case (#err(e)) { #err(e) };
            case (#ok(_)) {
                tables := textOps.delete(tables, name);
                tableRecords := textOps.delete(tableRecords, name);
                recordCounters := textOps.delete(recordCounters, name);
                #ok(())
            };
        }
    };

    // Insert a record into an owned table and increment recordCount.
    public shared(msg) func insert(
        tableName: TableName,
        data: [(Text, Text)]
    ) : async Result.Result<Record, Text> {
        let table = switch (authorizeTable(tableName, msg.caller, false)) {
            case (#err(e)) { return #err(e); };
            case (#ok(t)) { t };
        };
        switch (validateRecordData(data)) {
            case (?errMsg) { return #err(errMsg); };
            case null {};
        };
        if (table.recordCount >= MAX_RECORDS_PER_TABLE) {
            return #err(ERR_QUOTA_EXCEEDED);
        };

        let counter = switch (textOps.get(recordCounters, tableName)) {
            case (?c) { c };
            case null { 0 };
        };
        let recordId = "rec-" # Nat.toText(counter);
        recordCounters := textOps.put(recordCounters, tableName, counter + 1);

        let now = Time.now();
        let record : Record = {
            id = recordId;
            data = data;
            createdAt = now;
            updatedAt = now;
        };

        let recordsMap = switch (textOps.get(tableRecords, tableName)) {
            case (?m) { m };
            case null { textOps.empty() };
        };
        tableRecords := textOps.put(tableRecords, tableName, textOps.put(recordsMap, recordId, record));
        tables := textOps.put(tables, tableName, { table with recordCount = table.recordCount + 1 });
        #ok(record)
    };

    // Get a record by table + ID (owner or controller only).
    public shared query(msg) func get(
        tableName: TableName,
        recordId: RecordId
    ) : async Result.Result<Record, Text> {
        switch (authorizeTable(tableName, msg.caller, true)) {
            case (#err(e)) { return #err(e); };
            case (#ok(_)) {};
        };
        switch (textOps.get(tableRecords, tableName)) {
            case null { #err(ERR_RECORD_NOT_FOUND) };
            case (?recordsMap) {
                switch (textOps.get(recordsMap, recordId)) {
                    case null { #err(ERR_RECORD_NOT_FOUND) };
                    case (?rec) { #ok(rec) };
                }
            };
        }
    };

    // Query records in an owned table by exact field match (no duplicate entries per record).
    // Named queryByField because `query` is a reserved Motoko keyword.
    public shared query(msg) func queryByField(
        tableName: TableName,
        field: Text,
        value: Text
    ) : async Result.Result<[Record], Text> {
        switch (authorizeTable(tableName, msg.caller, true)) {
            case (#err(e)) { return #err(e); };
            case (#ok(_)) {};
        };
        var result : [Record] = [];
        switch (textOps.get(tableRecords, tableName)) {
            case null {};
            case (?recordsMap) {
                for ((_, record) in textOps.entries(recordsMap)) {
                    label scan for ((k, v) in record.data.vals()) {
                        if (k == field and v == value) {
                            result := Array.append(result, [record]);
                            break scan;
                        };
                    };
                };
            };
        };
        #ok(result)
    };

    // Update a record inside an owned table (fixes unauthenticated update vulnerability).
    public shared(msg) func update(
        tableName: TableName,
        recordId: RecordId,
        data: [(Text, Text)]
    ) : async Result.Result<Record, Text> {
        switch (authorizeTable(tableName, msg.caller, false)) {
            case (#err(e)) { return #err(e); };
            case (#ok(_)) {};
        };
        switch (validateRecordData(data)) {
            case (?errMsg) { return #err(errMsg); };
            case null {};
        };
        let recordsMap = switch (textOps.get(tableRecords, tableName)) {
            case null { return #err(ERR_RECORD_NOT_FOUND); };
            case (?m) { m };
        };
        switch (textOps.get(recordsMap, recordId)) {
            case null { #err(ERR_RECORD_NOT_FOUND) };
            case (?existing) {
                let updated : Record = {
                    id = recordId;
                    data = data;
                    createdAt = existing.createdAt;
                    updatedAt = Time.now();
                };
                tableRecords := textOps.put(tableRecords, tableName, textOps.put(recordsMap, recordId, updated));
                #ok(updated)
            };
        }
    };

    // Delete a record inside an owned table and decrement recordCount (owner only).
    public shared(msg) func delete(
        tableName: TableName,
        recordId: RecordId
    ) : async Result.Result<(), Text> {
        let table = switch (authorizeTable(tableName, msg.caller, false)) {
            case (#err(e)) { return #err(e); };
            case (#ok(t)) { t };
        };
        let recordsMap = switch (textOps.get(tableRecords, tableName)) {
            case null { return #err(ERR_RECORD_NOT_FOUND); };
            case (?m) { m };
        };
        if (not textOps.contains(recordsMap, recordId)) {
            return #err(ERR_RECORD_NOT_FOUND);
        };
        tableRecords := textOps.put(tableRecords, tableName, textOps.delete(recordsMap, recordId));
        let nextCount : Nat = if (table.recordCount > 0) { table.recordCount - 1 } else { 0 };
        tables := textOps.put(tables, tableName, { table with recordCount = nextCount });
        #ok(())
    };

    // List all records in an owned table.
    public shared query(msg) func list(tableName: TableName) : async Result.Result<[Record], Text> {
        switch (authorizeTable(tableName, msg.caller, true)) {
            case (#err(e)) { return #err(e); };
            case (#ok(_)) {};
        };
        var result : [Record] = [];
        switch (textOps.get(tableRecords, tableName)) {
            case null {};
            case (?recordsMap) {
                for ((_, record) in textOps.entries(recordsMap)) {
                    result := Array.append(result, [record]);
                };
            };
        };
        #ok(result)
    };

    // Get aggregate platform database stats (controllers only).
    public shared query(msg) func getStats() : async Result.Result<{ tables: Nat; records: Nat }, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        var totalRecords : Nat = 0;
        for ((_, t) in textOps.entries(tables)) {
            totalRecords += t.recordCount;
        };
        #ok({
            tables = textOps.size(tables);
            records = totalRecords;
        })
    };
}
