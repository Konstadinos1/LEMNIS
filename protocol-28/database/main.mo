// Protocol 28 - Database Canister
// Key-Value store with query capabilities

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Iter "mo:base/Iter";

actor Database {
    
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
    
    // State
    private var tables = HashMap.HashMap<TableName, Table>(10, Text.equal, Text.hash);
    private var records = HashMap.HashMap<Text, Record>(100, Text.equal, Text.hash);
    private var recordCounters = HashMap.HashMap<TableName, Nat>(10, Text.equal, Text.hash);
    
    // Create a table
    public shared(msg) func createTable(name: TableName) : async Result.Result<Table, Text> {
        switch (tables.get(name)) {
            case (?_) { #err("Table already exists") };
            case null {
                let table : Table = {
                    name = name;
                    owner = msg.caller;
                    recordCount = 0;
                    createdAt = Time.now();
                };
                tables.put(name, table);
                recordCounters.put(name, 0);
                #ok(table)
            };
        };
    };
    
    // Insert a record
    public shared(msg) func insert(
        tableName: TableName,
        data: [(Text, Text)]
    ) : async Result.Result<Record, Text> {
        
        switch (tables.get(tableName)) {
            case null { return #err("Table not found") };
            case (?table) {
                if (not Principal.equal(table.owner, msg.caller)) {
                    return #err("Not authorized");
                };
            };
        };
        
        // Generate record ID
        let counter = switch (recordCounters.get(tableName)) {
            case (?c) { c };
            case null { 0 };
        };
        let recordId = tableName # "-" # Nat.toText(counter);
        recordCounters.put(tableName, counter + 1);
        
        let record : Record = {
            id = recordId;
            data = data;
            createdAt = Time.now();
            updatedAt = Time.now();
        };
        
        records.put(recordId, record);
        #ok(record)
    };
    
    // Get a record by ID
    public query func get(recordId: RecordId) : async ?Record {
        records.get(recordId)
    };
    
    // Query records by field value
    public query func query(
        tableName: TableName,
        field: Text,
        value: Text
    ) : async [Record] {
        var result : [Record] = [];
        let prefix = tableName # "-";
        
        for ((key, record) in records.entries()) {
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
    public shared(msg) func update(
        recordId: RecordId,
        data: [(Text, Text)]
    ) : async Result.Result<Record, Text> {
        
        switch (records.get(recordId)) {
            case null { #err("Record not found") };
            case (?existing) {
                let updated : Record = {
                    id = recordId;
                    data = data;
                    createdAt = existing.createdAt;
                    updatedAt = Time.now();
                };
                records.put(recordId, updated);
                #ok(updated)
            };
        };
    };
    
    // Delete a record
    public shared(msg) func delete(recordId: RecordId) : async Result.Result<(), Text> {
        switch (records.get(recordId)) {
            case null { #err("Record not found") };
            case (?_) {
                records.delete(recordId);
                #ok(())
            };
        };
    };
    
    // List all records in a table
    public query func list(tableName: TableName) : async [Record] {
        var result : [Record] = [];
        let prefix = tableName # "-";
        
        for ((key, record) in records.entries()) {
            if (Text.startsWith(key, #text prefix)) {
                result := Array.append(result, [record]);
            };
        };
        
        result
    };
    
    // Get database stats
    public query func getStats() : async { tables: Nat; records: Nat } {
        {
            tables = tables.size();
            records = records.size();
        }
    };
}
