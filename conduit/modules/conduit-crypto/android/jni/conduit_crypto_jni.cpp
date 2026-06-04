#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include "ConduitCrypto.h"  // shared C header from ../ios/

#define LOG_TAG "ConduitCrypto"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ── Helpers ──────────────────────────────────────────────────────────────────

static std::vector<uint8_t> jbyteArrayToVec(JNIEnv *env, jbyteArray arr) {
    if (!arr) return {};
    jsize len = env->GetArrayLength(arr);
    std::vector<uint8_t> vec(len);
    env->GetByteArrayRegion(arr, 0, len, reinterpret_cast<jbyte*>(vec.data()));
    return vec;
}

static jbyteArray vecToJByteArray(JNIEnv *env, const std::vector<uint8_t>& vec) {
    jbyteArray arr = env->NewByteArray(vec.size());
    env->SetByteArrayRegion(arr, 0, vec.size(), reinterpret_cast<const jbyte*>(vec.data()));
    return arr;
}

static void throwIfError(JNIEnv *env, int32_t rc, const char* op) {
    if (rc != CONDUIT_OK) {
        std::string msg = std::string(op) + " failed: rc=" + std::to_string(rc);
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), msg.c_str());
    }
}

// ── JNI exports ──────────────────────────────────────────────────────────────

extern "C" {

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_randomBytes(JNIEnv *env, jclass, jint len) {
    std::vector<uint8_t> out(len);
    int32_t rc = conduit_random_bytes(out.data(), len);
    throwIfError(env, rc, "randomBytes");
    return vecToJByteArray(env, out);
}

JNIEXPORT jobjectArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_x25519Keypair(JNIEnv *env, jclass) {
    std::vector<uint8_t> secret(32), pub(32);
    int32_t rc = conduit_x25519_keypair(secret.data(), pub.data());
    throwIfError(env, rc, "x25519Keypair");
    jobjectArray result = env->NewObjectArray(2, env->FindClass("[B"), nullptr);
    env->SetObjectArrayElement(result, 0, vecToJByteArray(env, secret));
    env->SetObjectArrayElement(result, 1, vecToJByteArray(env, pub));
    return result;
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_x25519Dh(
    JNIEnv *env, jclass, jbyteArray mySecret, jbyteArray theirPublic) {
    auto sec = jbyteArrayToVec(env, mySecret);
    auto pub = jbyteArrayToVec(env, theirPublic);
    std::vector<uint8_t> shared(32);
    int32_t rc = conduit_x25519_dh(sec.data(), pub.data(), shared.data());
    throwIfError(env, rc, "x25519Dh");
    return vecToJByteArray(env, shared);
}

JNIEXPORT jobjectArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_ed25519Keypair(JNIEnv *env, jclass) {
    std::vector<uint8_t> secret(64), pub(32);
    int32_t rc = conduit_ed25519_keypair(secret.data(), pub.data());
    throwIfError(env, rc, "ed25519Keypair");
    jobjectArray result = env->NewObjectArray(2, env->FindClass("[B"), nullptr);
    env->SetObjectArrayElement(result, 0, vecToJByteArray(env, secret));
    env->SetObjectArrayElement(result, 1, vecToJByteArray(env, pub));
    return result;
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_ed25519Sign(
    JNIEnv *env, jclass, jbyteArray message, jbyteArray secretKey) {
    auto msg = jbyteArrayToVec(env, message);
    auto sk  = jbyteArrayToVec(env, secretKey);
    std::vector<uint8_t> sig(64);
    int32_t rc = conduit_ed25519_sign(msg.data(), msg.size(), sk.data(), sig.data());
    throwIfError(env, rc, "ed25519Sign");
    return vecToJByteArray(env, sig);
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_ed25519Verify(
    JNIEnv *env, jclass, jbyteArray message, jbyteArray signature, jbyteArray publicKey) {
    auto msg = jbyteArrayToVec(env, message);
    auto sig = jbyteArrayToVec(env, signature);
    auto pk  = jbyteArrayToVec(env, publicKey);
    int32_t rc = conduit_ed25519_verify(msg.data(), msg.size(), sig.data(), pk.data());
    return static_cast<jboolean>(rc == CONDUIT_OK);
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_aesGcmEncrypt(
    JNIEnv *env, jclass,
    jbyteArray key, jbyteArray nonce, jbyteArray plaintext, jbyteArray aad) {
    auto k  = jbyteArrayToVec(env, key);
    auto n  = jbyteArrayToVec(env, nonce);
    auto pt = jbyteArrayToVec(env, plaintext);
    auto ad = jbyteArrayToVec(env, aad);
    std::vector<uint8_t> ct(pt.size() + 16);
    int32_t rc = conduit_aes_gcm_encrypt(
        k.data(), n.data(), pt.data(), pt.size(), ad.data(), ad.size(), ct.data());
    throwIfError(env, rc, "aesGcmEncrypt");
    return vecToJByteArray(env, ct);
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_aesGcmDecrypt(
    JNIEnv *env, jclass,
    jbyteArray key, jbyteArray nonce, jbyteArray ciphertext, jbyteArray aad) {
    auto k  = jbyteArrayToVec(env, key);
    auto n  = jbyteArrayToVec(env, nonce);
    auto ct = jbyteArrayToVec(env, ciphertext);
    auto ad = jbyteArrayToVec(env, aad);
    if (ct.size() < 16) {
        env->ThrowNew(env->FindClass("java/lang/IllegalArgumentException"), "ciphertext too short");
        return nullptr;
    }
    std::vector<uint8_t> pt(ct.size() - 16);
    int32_t rc = conduit_aes_gcm_decrypt(
        k.data(), n.data(), ct.data(), ct.size(), ad.data(), ad.size(), pt.data());
    throwIfError(env, rc, "aesGcmDecrypt");
    return vecToJByteArray(env, pt);
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_hkdfSha256(
    JNIEnv *env, jclass,
    jbyteArray ikm, jbyteArray salt, jbyteArray info, jint outputLen) {
    auto i = jbyteArrayToVec(env, ikm);
    auto s = jbyteArrayToVec(env, salt);
    auto n = jbyteArrayToVec(env, info);
    std::vector<uint8_t> out(outputLen);
    int32_t rc = conduit_hkdf_sha256(
        i.data(), i.size(), s.data(), s.size(), n.data(), n.size(), out.data(), outputLen);
    throwIfError(env, rc, "hkdfSha256");
    return vecToJByteArray(env, out);
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_hmacSha256(
    JNIEnv *env, jclass, jbyteArray key, jbyteArray data) {
    auto k = jbyteArrayToVec(env, key);
    auto d = jbyteArrayToVec(env, data);
    std::vector<uint8_t> mac(32);
    int32_t rc = conduit_hmac_sha256(k.data(), k.size(), d.data(), d.size(), mac.data());
    throwIfError(env, rc, "hmacSha256");
    return vecToJByteArray(env, mac);
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_sha256(
    JNIEnv *env, jclass, jbyteArray data) {
    auto d = jbyteArrayToVec(env, data);
    std::vector<uint8_t> hash(32);
    int32_t rc = conduit_sha256(d.data(), d.size(), hash.data());
    throwIfError(env, rc, "sha256");
    return vecToJByteArray(env, hash);
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_conduitcrypto_ConduitCryptoJni_constantTimeEq(
    JNIEnv *env, jclass, jbyteArray a, jbyteArray b) {
    auto av = jbyteArrayToVec(env, a);
    auto bv = jbyteArrayToVec(env, b);
    if (av.size() != bv.size()) return JNI_FALSE;
    int32_t rc = conduit_constant_time_eq(av.data(), bv.data(), av.size());
    return static_cast<jboolean>(rc == 1);
}

} // extern "C"
