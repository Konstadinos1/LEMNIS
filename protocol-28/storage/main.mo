// Protocol 28 - Storage Canister
// On-chain object storage for small control-plane assets and configuration blobs.
// Note: ICP on-chain storage (~$0.45/GB-mo) is intended for small replicated assets,
// not bulk media; bulk storage uses IPFS/Storacha off-chain pinning.

import Array "mo:base/Array";
import Blob "mo:base/Blob";
import Map "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";

persistent actor Storage {

    // Public Types
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
        isPublic: Bool;
        objectCount: Nat;
        totalSize: Nat;
        createdAt: Time.Time;
    };

    public type UploadResult = Result.Result<StorageObject, Text>;

    // Named constants & error strings (transient so updates survive upgrades).
    transient let MIN_BUCKET_LEN : Nat = 3;
    transient let MAX_BUCKET_LEN : Nat = 63;
    transient let MAX_KEY_LEN : Nat = 256;
    transient let MAX_CONTENT_TYPE_LEN : Nat = 128;
    transient let MAX_BUCKETS_PER_OWNER : Nat = 20;
    transient let MAX_OBJECTS_PER_BUCKET : Nat = 1_000;
    transient let MAX_OBJECT_SIZE_BYTES : Nat = 2_097_152;    // 2 MiB ICP ingress ceiling
    transient let MAX_BUCKET_TOTAL_BYTES : Nat = 67_108_864;  // 64 MiB per bucket

    transient let ERR_ANONYMOUS : Text = "Anonymous principal is not permitted";
    transient let ERR_NOT_AUTHORIZED : Text = "Not authorized";
    transient let ERR_NOT_CONTROLLER : Text = "Unauthorized: controller privileges required";
    transient let ERR_BUCKET_NOT_FOUND : Text = "Bucket not found";
    transient let ERR_OBJECT_NOT_FOUND : Text = "Object not found";
    transient let ERR_INVALID_BUCKET_NAME : Text = "Bucket name must be 3-63 lowercase alphanumeric chars or hyphens";
    transient let ERR_INVALID_KEY : Text = "Object key must be 1-256 chars without leading '/' or '..' segments";
    transient let ERR_QUOTA_EXCEEDED : Text = "Storage quota exceeded";

    // Map operations (transient because function records are non-stable).
    transient let textOps = Map.Make<Text>(Text.compare);

    // Persisted state. Nested per-bucket map structurally prevents cross-bucket key collisions.
    var buckets : Map.Map<BucketId, Bucket> = textOps.empty();
    var bucketObjects : Map.Map<BucketId, Map.Map<ObjectKey, StorageObject>> = textOps.empty();

    func isValidBucketName(name: Text) : Bool {
        let len = name.size();
        if (len < MIN_BUCKET_LEN or len > MAX_BUCKET_LEN) {
            return false;
        };
        var idx : Nat = 0;
        for (c in name.chars()) {
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

    func isValidObjectKey(key: Text) : Bool {
        let len = key.size();
        if (len == 0 or len > MAX_KEY_LEN) {
            return false;
        };
        if (Text.startsWith(key, #text "/") or Text.contains(key, #text "..") or Text.contains(key, #text "\00")) {
            return false;
        };
        true
    };

    func countOwnerBuckets(owner: Principal) : Nat {
        var count : Nat = 0;
        for ((_, b) in textOps.entries(buckets)) {
            if (Principal.equal(b.owner, owner)) {
                count += 1;
            };
        };
        count
    };

    func canReadBucket(bucket: Bucket, caller: Principal) : Bool {
        bucket.isPublic or Principal.equal(bucket.owner, caller) or Principal.isController(caller)
    };

    // Create a new private-by-default bucket.
    public shared(msg) func createBucket(name: Text) : async Result.Result<Bucket, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        if (not isValidBucketName(name)) {
            return #err(ERR_INVALID_BUCKET_NAME);
        };
        if (textOps.contains(buckets, name)) {
            return #err("Bucket already exists");
        };
        if (countOwnerBuckets(msg.caller) >= MAX_BUCKETS_PER_OWNER) {
            return #err(ERR_QUOTA_EXCEEDED);
        };

        let bucket : Bucket = {
            id = name;
            owner = msg.caller;
            isPublic = false;
            objectCount = 0;
            totalSize = 0;
            createdAt = Time.now();
        };
        buckets := textOps.put(buckets, name, bucket);
        bucketObjects := textOps.put(bucketObjects, name, textOps.empty());
        #ok(bucket)
    };

    // Toggle public read access on a bucket (owner only).
    public shared(msg) func setBucketVisibility(
        bucketId: BucketId,
        isPublic: Bool
    ) : async Result.Result<Bucket, Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(buckets, bucketId)) {
            case null { #err(ERR_BUCKET_NOT_FOUND) };
            case (?bucket) {
                if (not Principal.equal(bucket.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                let updated : Bucket = { bucket with isPublic = isPublic };
                buckets := textOps.put(buckets, bucketId, updated);
                #ok(updated)
            };
        }
    };

    // List buckets owned by caller.
    public shared query(msg) func listBuckets() : async [Bucket] {
        if (Principal.isAnonymous(msg.caller)) {
            return [];
        };
        var result : [Bucket] = [];
        for ((_, bucket) in textOps.entries(buckets)) {
            if (Principal.equal(bucket.owner, msg.caller)) {
                result := Array.append(result, [bucket]);
            };
        };
        result
    };

    // Delete an empty bucket (owner only).
    public shared(msg) func deleteBucket(bucketId: BucketId) : async Result.Result<(), Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        switch (textOps.get(buckets, bucketId)) {
            case null { #err(ERR_BUCKET_NOT_FOUND) };
            case (?bucket) {
                if (not Principal.equal(bucket.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                if (bucket.objectCount > 0) {
                    return #err("Bucket is not empty; delete all objects first");
                };
                buckets := textOps.delete(buckets, bucketId);
                bucketObjects := textOps.delete(bucketObjects, bucketId);
                #ok(())
            };
        }
    };

    // Upload or overwrite an object inside an owned bucket, keeping counters exact.
    public shared(msg) func uploadObject(
        bucketId: BucketId,
        key: ObjectKey,
        data: Blob,
        contentType: Text
    ) : async UploadResult {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        if (not isValidObjectKey(key)) {
            return #err(ERR_INVALID_KEY);
        };
        if (contentType.size() == 0 or contentType.size() > MAX_CONTENT_TYPE_LEN) {
            return #err("Invalid content type");
        };
        let objSize = data.size();
        if (objSize > MAX_OBJECT_SIZE_BYTES) {
            return #err("Object exceeds 2 MiB maximum size");
        };

        let bucket = switch (textOps.get(buckets, bucketId)) {
            case null { return #err(ERR_BUCKET_NOT_FOUND); };
            case (?b) {
                if (not Principal.equal(b.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                b
            };
        };

        let objectsMap = switch (textOps.get(bucketObjects, bucketId)) {
            case (?m) { m };
            case null { textOps.empty() };
        };

        let now = Time.now();
        let (createdAt, nextCount, nextTotalSize) : (Time.Time, Nat, Nat) = switch (textOps.get(objectsMap, key)) {
            case (?existing) {
                // Subtract before adding using saturated arithmetic so totalSize never drifts.
                let baseSize : Nat = if (bucket.totalSize >= existing.size) {
                    bucket.totalSize - existing.size
                } else {
                    0
                };
                (existing.createdAt, bucket.objectCount, baseSize + objSize)
            };
            case null {
                if (bucket.objectCount >= MAX_OBJECTS_PER_BUCKET) {
                    return #err(ERR_QUOTA_EXCEEDED);
                };
                (now, bucket.objectCount + 1, bucket.totalSize + objSize)
            };
        };

        if (nextTotalSize > MAX_BUCKET_TOTAL_BYTES) {
            return #err(ERR_QUOTA_EXCEEDED);
        };

        let obj : StorageObject = {
            key = key;
            data = data;
            contentType = contentType;
            size = objSize;
            owner = msg.caller;
            createdAt = createdAt;
            updatedAt = now;
        };

        let updatedObjects = textOps.put(objectsMap, key, obj);
        bucketObjects := textOps.put(bucketObjects, bucketId, updatedObjects);
        buckets := textOps.put(buckets, bucketId, {
            bucket with
            objectCount = nextCount;
            totalSize = nextTotalSize;
        });
        #ok(obj)
    };

    // Download an object (enforces bucket visibility / ownership).
    public shared query(msg) func getObject(
        bucketId: BucketId,
        key: ObjectKey
    ) : async Result.Result<StorageObject, Text> {
        let bucket = switch (textOps.get(buckets, bucketId)) {
            case null { return #err(ERR_BUCKET_NOT_FOUND); };
            case (?b) { b };
        };
        if (not canReadBucket(bucket, msg.caller)) {
            return #err(ERR_NOT_AUTHORIZED);
        };
        switch (textOps.get(bucketObjects, bucketId)) {
            case null { #err(ERR_OBJECT_NOT_FOUND) };
            case (?objectsMap) {
                switch (textOps.get(objectsMap, key)) {
                    case null { #err(ERR_OBJECT_NOT_FOUND) };
                    case (?obj) { #ok(obj) };
                }
            };
        }
    };

    // List object keys in a bucket (enforces bucket visibility / ownership).
    public shared query(msg) func listObjects(bucketId: BucketId) : async Result.Result<[ObjectKey], Text> {
        let bucket = switch (textOps.get(buckets, bucketId)) {
            case null { return #err(ERR_BUCKET_NOT_FOUND); };
            case (?b) { b };
        };
        if (not canReadBucket(bucket, msg.caller)) {
            return #err(ERR_NOT_AUTHORIZED);
        };
        var result : [ObjectKey] = [];
        switch (textOps.get(bucketObjects, bucketId)) {
            case null {};
            case (?objectsMap) {
                for ((k, _) in textOps.entries(objectsMap)) {
                    result := Array.append(result, [k]);
                };
            };
        };
        #ok(result)
    };

    // Delete an object and update bucket counters (owner only).
    public shared(msg) func deleteObject(
        bucketId: BucketId,
        key: ObjectKey
    ) : async Result.Result<(), Text> {
        if (Principal.isAnonymous(msg.caller)) {
            return #err(ERR_ANONYMOUS);
        };
        let bucket = switch (textOps.get(buckets, bucketId)) {
            case null { return #err(ERR_BUCKET_NOT_FOUND); };
            case (?b) {
                if (not Principal.equal(b.owner, msg.caller)) {
                    return #err(ERR_NOT_AUTHORIZED);
                };
                b
            };
        };
        let objectsMap = switch (textOps.get(bucketObjects, bucketId)) {
            case null { return #err(ERR_OBJECT_NOT_FOUND); };
            case (?m) { m };
        };
        switch (textOps.get(objectsMap, key)) {
            case null { #err(ERR_OBJECT_NOT_FOUND) };
            case (?obj) {
                let updatedObjects = textOps.delete(objectsMap, key);
                bucketObjects := textOps.put(bucketObjects, bucketId, updatedObjects);
                let nextCount : Nat = if (bucket.objectCount > 0) { bucket.objectCount - 1 } else { 0 };
                let nextSize : Nat = if (bucket.totalSize >= obj.size) { bucket.totalSize - obj.size } else { 0 };
                buckets := textOps.put(buckets, bucketId, {
                    bucket with
                    objectCount = nextCount;
                    totalSize = nextSize;
                });
                #ok(())
            };
        }
    };

    // Get aggregate platform storage stats (controllers only).
    public shared query(msg) func getStats() : async Result.Result<{ buckets: Nat; objects: Nat; totalBytes: Nat }, Text> {
        if (not Principal.isController(msg.caller)) {
            return #err(ERR_NOT_CONTROLLER);
        };
        var totalObjects : Nat = 0;
        var totalBytes : Nat = 0;
        for ((_, b) in textOps.entries(buckets)) {
            totalObjects += b.objectCount;
            totalBytes += b.totalSize;
        };
        #ok({
            buckets = textOps.size(buckets);
            objects = totalObjects;
            totalBytes = totalBytes;
        })
    };
}
