// Protocol 28 - Storage Canister
// Decentralized blob storage (S3 equivalent)

import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Blob "mo:base/Blob";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Result "mo:base/Result";

persistent actor Storage {
    
    // Types
    public type BucketId = Text;
    public type ObjectKey = Text;
    
    public type StorageObject = {
        key: ObjectKey;
        data: Blob;
        contentType: Text;
        size: Nat;
        owner: Principal;
        createdAt: Time.Time;
        updatedAt: Time.Time;
    };
    
    public type Bucket = {
        id: BucketId;
        owner: Principal;
        objectCount: Nat;
        totalSize: Nat;
        createdAt: Time.Time;
    };
    
    public type UploadResult = Result.Result<StorageObject, Text>;
    
    // State
    // transient: not persisted across canister upgrades (see CLAUDE.md).
    transient var buckets = HashMap.HashMap<BucketId, Bucket>(10, Text.equal, Text.hash);
    transient var objects = HashMap.HashMap<Text, StorageObject>(100, Text.equal, Text.hash);
    
    // Create a bucket
    public shared(msg) func createBucket(name: Text) : async Result.Result<Bucket, Text> {
        switch (buckets.get(name)) {
            case (?_) { #err("Bucket already exists") };
            case null {
                let bucket : Bucket = {
                    id = name;
                    owner = msg.caller;
                    objectCount = 0;
                    totalSize = 0;
                    createdAt = Time.now();
                };
                buckets.put(name, bucket);
                #ok(bucket)
            };
        };
    };
    
    // Upload an object
    public shared(msg) func uploadObject(
        bucketId: BucketId, 
        key: ObjectKey, 
        data: Blob, 
        contentType: Text
    ) : async UploadResult {
        
        // Check bucket exists and caller owns it
        switch (buckets.get(bucketId)) {
            case null { return #err("Bucket not found") };
            case (?bucket) {
                if (not Principal.equal(bucket.owner, msg.caller)) {
                    return #err("Not authorized");
                };
            };
        };
        
        let fullKey = bucketId # "/" # key;
        let obj : StorageObject = {
            key = key;
            data = data;
            contentType = contentType;
            size = Blob.toArray(data).size();
            owner = msg.caller;
            createdAt = Time.now();
            updatedAt = Time.now();
        };
        
        objects.put(fullKey, obj);
        #ok(obj)
    };
    
    // Download an object
    public query func getObject(bucketId: BucketId, key: ObjectKey) : async ?StorageObject {
        let fullKey = bucketId # "/" # key;
        objects.get(fullKey)
    };
    
    // List objects in bucket
    public query func listObjects(bucketId: BucketId) : async [ObjectKey] {
        var result : [ObjectKey] = [];
        let prefix = bucketId # "/";
        
        for ((key, obj) in objects.entries()) {
            if (Text.startsWith(key, #text prefix)) {
                result := Array.append(result, [obj.key]);
            };
        };
        
        result
    };
    
    // Delete object
    public shared(msg) func deleteObject(bucketId: BucketId, key: ObjectKey) : async Result.Result<(), Text> {
        let fullKey = bucketId # "/" # key;
        
        switch (objects.get(fullKey)) {
            case null { #err("Object not found") };
            case (?obj) {
                if (not Principal.equal(obj.owner, msg.caller)) {
                    return #err("Not authorized");
                };
                objects.delete(fullKey);
                #ok(())
            };
        };
    };
    
    // Get storage stats
    public query func getStats() : async { buckets: Nat; objects: Nat } {
        {
            buckets = buckets.size();
            objects = objects.size();
        }
    };
}
