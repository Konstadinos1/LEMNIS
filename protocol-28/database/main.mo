// Protocol 28 - Database Canister
// Key-Value store with query capabilities

import Principal "mo:base/Principal";
import Map "mo:base/OrderedMap";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Result "mo:base/Result";

persistent actor Database {

    // Types
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

    // Map operations for Text keys (shared by all maps). transient: holds
    // functions and is reconstructed deterministically on every upgrade.
    transient let textOps = Map.Make<Text>(Text.compare);

    // State. Persisted across upgrades via enhanced orthogonal persistence.
    // recordCounters is persisted too, so record IDs stay unique after upgrade.
    var tables : Map.Map<TableName, Table> = textOps.empty();
    var records : Map.Map<Text, Record> = textOps.empty();
    var recordCounters : Map.Map<TableName, Nat> = textOps.empty();

    // Create a table
    public shared(msg) func createTable(name: TableName) : async Result.Result<Table, Text> {
        switch (textOps.get(tables, name)) {
            case (?_) { #err("Table already exists") };
            case null {
                let table : Table = {
                    name = name;
                    owner = msg.caller;
                    recordCount = 0;
                    createdAt = Time.now();
                };
                tables := textOps.put(tables, name, table);
                recordCounters := textOps.put(recordCounters, name, 0);
                #ok(table)
            };
        };
    };

    // Insert a record
    public shared(msg) func insert(
        tableName: TableName,
        data: [(Text, Text)]
    ) : async Result.Result<Record, Text> {

        switch (textOps.get(tables, tableName)) {
            case null { return #err("Table not found") };
            case (?table) {
                if (not Principal.equal(table.owner, msg.caller)) {
                    return #err("Not authorized");
                };
            };
        };

        // Generate record ID
        let counter = switch (textOps.get(recordCounters, tableName)) {
            case (?c) { c };
            case null { 0 };
        };
        let recordId = tableName # "-" # Nat.toText(counter);
        recordCounters := textOps.put(recordCounters, tableName, counter + 1);

        let record : Record = {
            id = recordId;
            data = data;
            createdAt = Time.now();
            updatedAt = Time.now();
        };

        records := textOps.put(records, recordId, record);
        #ok(record)
    };

    // Get a record by ID
    public query func get(recordId: RecordId) : async ?Record {
        textOps.get(records, recordId)
    };

    // Query records by field value.
    // Named queryByField because `query` is a reserved Motoko keyword.
    public query func queryByField(
        tableName: TableName,
        field: Text,
        value: Text
    ) : async [Record] {
        var result : [Record] = [];
        let prefix = tableName # "-";

        for ((key, record) in textOps.entries(records)) {
            if (Text.startsWith(key, #text prefix)) {
                for ((k, v) in record.data.vals()) {
                    if (k == field and v == value) {
                        result := Array.append(result, [record]);
                    };
                };
            };
        };

        result
    };

    // Update a record
    public shared(_msg) func update(
        recordId: RecordId,
        data: [(Text, Text)]
    ) : async Result.Result<Record, Text> {

        switch (textOps.get(records, recordId)) {
            case null { #err("Record not found") };
            case (?existing) {
                let updated : Record = {
                    id = recordId;
                    data = data;
                    createdAt = existing.createdAt;
                    updatedAt = Time.now();
                };
                records := textOps.put(records, recordId, updated);
                #ok(updated)
            };
        };
    };

    // Delete a record
    public shared(_msg) func delete(recordId: RecordId) : async Result.Result<(), Text> {
        switch (textOps.get(records, recordId)) {
            case null { #err("Record not found") };
            case (?_) {
                records := textOps.delete(records, recordId);
                #ok(())
            };
        };
    };

    // List all records in a table
    public query func list(tableName: TableName) : async [Record] {
        var result : [Record] = [];
        let prefix = tableName # "-";

        for ((key, record) in textOps.entries(records)) {
            if (Text.startsWith(key, #text prefix)) {
                result := Array.append(result, [record]);
            };
        };

        result
    };

    // Get database stats
    public query func getStats() : async { tables: Nat; records: Nat } {
        {
            tables = textOps.size(tables);
            records = textOps.size(records);
        }
    };
}
