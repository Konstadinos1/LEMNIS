import ExpoModulesCore
import Foundation

// MARK: - Module

public class ConduitCryptoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ConduitCrypto")

    // ── Random ──────────────────────────────────────────────────────────────

    AsyncFunction("randomBytes") { (len: Int) -> String in
      guard len > 0 && len <= 4096 else {
        throw CryptoError.invalidInput("len must be 1–4096")
      }
      var buf = [UInt8](repeating: 0, count: len)
      let rc = conduit_random_bytes(&buf, len)
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return Data(buf).base64EncodedString()
    }

    // ── X25519 ──────────────────────────────────────────────────────────────

    AsyncFunction("x25519Keypair") { () -> [String: String] in
      var secret = [UInt8](repeating: 0, count: 32)
      var pub    = [UInt8](repeating: 0, count: 32)
      let rc = conduit_x25519_keypair(&secret, &pub)
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return [
        "secretKey": Data(secret).base64EncodedString(),
        "publicKey": Data(pub).base64EncodedString(),
      ]
    }

    AsyncFunction("x25519DH") { (mySecretB64: String, theirPublicB64: String) -> String in
      guard let mySecret = Data(base64Encoded: mySecretB64), mySecret.count == 32,
            let theirPublic = Data(base64Encoded: theirPublicB64), theirPublic.count == 32
      else { throw CryptoError.invalidInput("keys must be 32-byte base64") }

      var shared = [UInt8](repeating: 0, count: 32)
      let rc = mySecret.withUnsafeBytes { ms in
        theirPublic.withUnsafeBytes { tp in
          conduit_x25519_dh(ms.baseAddress, tp.baseAddress, &shared)
        }
      }
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return Data(shared).base64EncodedString()
    }

    // ── Ed25519 ─────────────────────────────────────────────────────────────

    AsyncFunction("ed25519Keypair") { () -> [String: String] in
      var secret = [UInt8](repeating: 0, count: 64)
      var pub    = [UInt8](repeating: 0, count: 32)
      let rc = conduit_ed25519_keypair(&secret, &pub)
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return [
        "secretKey": Data(secret).base64EncodedString(),
        "publicKey": Data(pub).base64EncodedString(),
      ]
    }

    AsyncFunction("ed25519Sign") { (messageB64: String, secretKeyB64: String) -> String in
      guard let message = Data(base64Encoded: messageB64),
            let sk = Data(base64Encoded: secretKeyB64), sk.count == 64
      else { throw CryptoError.invalidInput("invalid message or secretKey") }

      var sig = [UInt8](repeating: 0, count: 64)
      let rc = message.withUnsafeBytes { msg in
        sk.withUnsafeBytes { skBytes in
          conduit_ed25519_sign(msg.baseAddress, message.count, skBytes.baseAddress, &sig)
        }
      }
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return Data(sig).base64EncodedString()
    }

    AsyncFunction("ed25519Verify") {
      (messageB64: String, signatureB64: String, publicKeyB64: String) -> Bool in
      guard let message = Data(base64Encoded: messageB64),
            let sig = Data(base64Encoded: signatureB64), sig.count == 64,
            let pk  = Data(base64Encoded: publicKeyB64),  pk.count == 32
      else { throw CryptoError.invalidInput("invalid message, signature, or publicKey") }

      let rc = message.withUnsafeBytes { msg in
        sig.withUnsafeBytes { sigBytes in
          pk.withUnsafeBytes { pkBytes in
            conduit_ed25519_verify(msg.baseAddress, message.count, sigBytes.baseAddress, pkBytes.baseAddress)
          }
        }
      }
      return rc == CONDUIT_OK
    }

    // ── AES-256-GCM ─────────────────────────────────────────────────────────

    AsyncFunction("aesGcmEncrypt") {
      (keyB64: String, nonceB64: String, plaintextB64: String, aadB64: String?) -> String in
      guard let key   = Data(base64Encoded: keyB64),   key.count == 32,
            let nonce = Data(base64Encoded: nonceB64), nonce.count == 12,
            let pt    = Data(base64Encoded: plaintextB64)
      else { throw CryptoError.invalidInput("invalid key (32B), nonce (12B), or plaintext") }

      let aad = aadB64.flatMap { Data(base64Encoded: $0) } ?? Data()
      var ct = [UInt8](repeating: 0, count: pt.count + 16)

      let rc = key.withUnsafeBytes { k in
        nonce.withUnsafeBytes { n in
          pt.withUnsafeBytes { p in
            aad.withUnsafeBytes { a in
              conduit_aes_gcm_encrypt(
                k.baseAddress, n.baseAddress,
                p.baseAddress, pt.count,
                a.baseAddress, aad.count,
                &ct
              )
            }
          }
        }
      }
      guard rc == CONDUIT_OK else { throw CryptoError.encryptFailed }
      return Data(ct).base64EncodedString()
    }

    AsyncFunction("aesGcmDecrypt") {
      (keyB64: String, nonceB64: String, ciphertextB64: String, aadB64: String?) -> String in
      guard let key   = Data(base64Encoded: keyB64),    key.count == 32,
            let nonce = Data(base64Encoded: nonceB64),  nonce.count == 12,
            let ct    = Data(base64Encoded: ciphertextB64), ct.count >= 16
      else { throw CryptoError.invalidInput("invalid key (32B), nonce (12B), or ciphertext") }

      let aad = aadB64.flatMap { Data(base64Encoded: $0) } ?? Data()
      var pt = [UInt8](repeating: 0, count: ct.count - 16)

      let rc = key.withUnsafeBytes { k in
        nonce.withUnsafeBytes { n in
          ct.withUnsafeBytes { c in
            aad.withUnsafeBytes { a in
              conduit_aes_gcm_decrypt(
                k.baseAddress, n.baseAddress,
                c.baseAddress, ct.count,
                a.baseAddress, aad.count,
                &pt
              )
            }
          }
        }
      }
      guard rc == CONDUIT_OK else { throw CryptoError.decryptFailed }
      return Data(pt).base64EncodedString()
    }

    // ── HKDF-SHA-256 ────────────────────────────────────────────────────────

    AsyncFunction("hkdfSha256") {
      (ikmB64: String, saltB64: String?, infoB64: String?, outputLen: Int) -> String in
      guard let ikm = Data(base64Encoded: ikmB64), outputLen > 0 && outputLen <= 8192
      else { throw CryptoError.invalidInput("invalid ikm or outputLen") }

      let salt = saltB64.flatMap { Data(base64Encoded: $0) } ?? Data()
      let info = infoB64.flatMap { Data(base64Encoded: $0) } ?? Data()
      var out = [UInt8](repeating: 0, count: outputLen)

      let rc = ikm.withUnsafeBytes { i in
        salt.withUnsafeBytes { s in
          info.withUnsafeBytes { n in
            conduit_hkdf_sha256(
              i.baseAddress, ikm.count,
              s.baseAddress, salt.count,
              n.baseAddress, info.count,
              &out, outputLen
            )
          }
        }
      }
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return Data(out).base64EncodedString()
    }

    // ── HMAC-SHA-256 ────────────────────────────────────────────────────────

    AsyncFunction("hmacSha256") { (keyB64: String, dataB64: String) -> String in
      guard let key  = Data(base64Encoded: keyB64),
            let data = Data(base64Encoded: dataB64)
      else { throw CryptoError.invalidInput("invalid key or data") }

      var mac = [UInt8](repeating: 0, count: 32)
      let rc = key.withUnsafeBytes { k in
        data.withUnsafeBytes { d in
          conduit_hmac_sha256(k.baseAddress, key.count, d.baseAddress, data.count, &mac)
        }
      }
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return Data(mac).base64EncodedString()
    }

    // ── SHA-256 ─────────────────────────────────────────────────────────────

    AsyncFunction("sha256") { (dataB64: String) -> String in
      guard let data = Data(base64Encoded: dataB64)
      else { throw CryptoError.invalidInput("invalid data") }

      var hash = [UInt8](repeating: 0, count: 32)
      let rc = data.withUnsafeBytes { d in
        conduit_sha256(d.baseAddress, data.count, &hash)
      }
      guard rc == CONDUIT_OK else { throw CryptoError.nativeError(rc) }
      return Data(hash).base64EncodedString()
    }

    // ── Constant-time equality ───────────────────────────────────────────────

    AsyncFunction("constantTimeEq") { (aB64: String, bB64: String) -> Bool in
      guard let a = Data(base64Encoded: aB64),
            let b = Data(base64Encoded: bB64),
            a.count == b.count
      else { return false }

      let rc = a.withUnsafeBytes { ap in
        b.withUnsafeBytes { bp in
          conduit_constant_time_eq(ap.baseAddress, bp.baseAddress, a.count)
        }
      }
      return rc == 1
    }
  }
}

// MARK: - Errors

enum CryptoError: Error {
  case invalidInput(String)
  case encryptFailed
  case decryptFailed
  case verifyFailed
  case nativeError(Int32)
}

extension CryptoError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .invalidInput(let msg): return "INVALID_INPUT: \(msg)"
    case .encryptFailed:         return "ENCRYPT_FAILED"
    case .decryptFailed:         return "DECRYPT_FAILED"
    case .verifyFailed:          return "VERIFY_FAILED"
    case .nativeError(let rc):   return "NATIVE_ERROR(\(rc))"
    }
  }
}
