package expo.modules.conduitcrypto

object ConduitCryptoJni {
  init {
    System.loadLibrary("conduit_crypto_jni")
  }

  @JvmStatic external fun randomBytes(len: Int): ByteArray
  @JvmStatic external fun x25519Keypair(): Array<ByteArray>       // [secret(32), public(32)]
  @JvmStatic external fun x25519Dh(mySecret: ByteArray, theirPublic: ByteArray): ByteArray
  @JvmStatic external fun ed25519Keypair(): Array<ByteArray>      // [secret(64), public(32)]
  @JvmStatic external fun ed25519Sign(message: ByteArray, secretKey: ByteArray): ByteArray
  @JvmStatic external fun ed25519Verify(message: ByteArray, signature: ByteArray, publicKey: ByteArray): Boolean
  @JvmStatic external fun aesGcmEncrypt(key: ByteArray, nonce: ByteArray, plaintext: ByteArray, aad: ByteArray): ByteArray
  @JvmStatic external fun aesGcmDecrypt(key: ByteArray, nonce: ByteArray, ciphertext: ByteArray, aad: ByteArray): ByteArray
  @JvmStatic external fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, outputLen: Int): ByteArray
  @JvmStatic external fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray
  @JvmStatic external fun sha256(data: ByteArray): ByteArray
  @JvmStatic external fun constantTimeEq(a: ByteArray, b: ByteArray): Boolean
}
