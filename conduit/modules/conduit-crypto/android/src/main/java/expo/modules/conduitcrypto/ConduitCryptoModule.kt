package expo.modules.conduitcrypto

import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ConduitCryptoModule : Module() {

  private val scope = CoroutineScope(Dispatchers.Default)

  override fun definition() = ModuleDefinition {
    Name("ConduitCrypto")

    // ── Random ────────────────────────────────────────────────────────────

    AsyncFunction("randomBytes") { len: Int ->
      ConduitCryptoJni.randomBytes(len).toBase64()
    }

    // ── X25519 ────────────────────────────────────────────────────────────

    AsyncFunction("x25519Keypair") {
      val (secret, pub) = ConduitCryptoJni.x25519Keypair()
      mapOf("secretKey" to secret.toBase64(), "publicKey" to pub.toBase64())
    }

    AsyncFunction("x25519DH") { mySecretB64: String, theirPublicB64: String ->
      val secret = mySecretB64.fromBase64()
      val pub = theirPublicB64.fromBase64()
      ConduitCryptoJni.x25519Dh(secret, pub).toBase64()
    }

    // ── Ed25519 ───────────────────────────────────────────────────────────

    AsyncFunction("ed25519Keypair") {
      val (secret, pub) = ConduitCryptoJni.ed25519Keypair()
      mapOf("secretKey" to secret.toBase64(), "publicKey" to pub.toBase64())
    }

    AsyncFunction("ed25519Sign") { messageB64: String, secretKeyB64: String ->
      val msg = messageB64.fromBase64()
      val sk = secretKeyB64.fromBase64()
      ConduitCryptoJni.ed25519Sign(msg, sk).toBase64()
    }

    AsyncFunction("ed25519Verify") { messageB64: String, signatureB64: String, publicKeyB64: String ->
      val msg = messageB64.fromBase64()
      val sig = signatureB64.fromBase64()
      val pk = publicKeyB64.fromBase64()
      ConduitCryptoJni.ed25519Verify(msg, sig, pk)
    }

    // ── AES-256-GCM ───────────────────────────────────────────────────────

    AsyncFunction("aesGcmEncrypt") { keyB64: String, nonceB64: String, plaintextB64: String, aadB64: String? ->
      val key = keyB64.fromBase64()
      val nonce = nonceB64.fromBase64()
      val pt = plaintextB64.fromBase64()
      val aad = aadB64?.fromBase64() ?: ByteArray(0)
      ConduitCryptoJni.aesGcmEncrypt(key, nonce, pt, aad).toBase64()
    }

    AsyncFunction("aesGcmDecrypt") { keyB64: String, nonceB64: String, ciphertextB64: String, aadB64: String? ->
      val key = keyB64.fromBase64()
      val nonce = nonceB64.fromBase64()
      val ct = ciphertextB64.fromBase64()
      val aad = aadB64?.fromBase64() ?: ByteArray(0)
      ConduitCryptoJni.aesGcmDecrypt(key, nonce, ct, aad).toBase64()
    }

    // ── HKDF-SHA-256 ──────────────────────────────────────────────────────

    AsyncFunction("hkdfSha256") { ikmB64: String, saltB64: String?, infoB64: String?, outputLen: Int ->
      val ikm = ikmB64.fromBase64()
      val salt = saltB64?.fromBase64() ?: ByteArray(0)
      val info = infoB64?.fromBase64() ?: ByteArray(0)
      ConduitCryptoJni.hkdfSha256(ikm, salt, info, outputLen).toBase64()
    }

    // ── HMAC-SHA-256 ──────────────────────────────────────────────────────

    AsyncFunction("hmacSha256") { keyB64: String, dataB64: String ->
      val key = keyB64.fromBase64()
      val data = dataB64.fromBase64()
      ConduitCryptoJni.hmacSha256(key, data).toBase64()
    }

    // ── SHA-256 ───────────────────────────────────────────────────────────

    AsyncFunction("sha256") { dataB64: String ->
      ConduitCryptoJni.sha256(dataB64.fromBase64()).toBase64()
    }

    // ── Constant-time equality ────────────────────────────────────────────

    AsyncFunction("constantTimeEq") { aB64: String, bB64: String ->
      val a = aB64.fromBase64()
      val b = bB64.fromBase64()
      ConduitCryptoJni.constantTimeEq(a, b)
    }
  }
}

private fun ByteArray.toBase64(): String =
  Base64.encodeToString(this, Base64.NO_WRAP)

private fun String.fromBase64(): ByteArray =
  Base64.decode(this, Base64.NO_WRAP)
