package expo.modules.passkeys

import android.content.Context
import android.os.Build
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.Base64

class ExpoPasskeysModule : Module() {

  private val moduleScope = CoroutineScope(Dispatchers.Main)

  override fun definition() = ModuleDefinition {
    Name("ExpoPasskeys")

    AsyncFunction("isPasskeySupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P // Android 9+ required for StrongBox
    }

    AsyncFunction("createPasskey") { rpId: String, userId: String, userName: String, challenge: String, promise: Promise ->
      moduleScope.launch {
        createPasskeyInternal(rpId, userId, userName, challenge, promise)
      }
    }

    AsyncFunction("signWithPasskey") { rpId: String, credentialId: String, challenge: String, promise: Promise ->
      moduleScope.launch {
        signWithPasskeyInternal(rpId, credentialId, challenge, promise)
      }
    }
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  private suspend fun createPasskeyInternal(
    rpId: String,
    userId: String,
    userName: String,
    challenge: String,
    promise: Promise
  ) {
    val activity = appContext.activityProvider?.currentActivity
      ?: return promise.reject(CodedException("NO_ACTIVITY", "No foreground activity", null))

    val requestJson = buildCreateRequestJson(rpId, userId, userName, challenge)
    val request = CreatePublicKeyCredentialRequest(
      requestJson = requestJson,
      // Prefer StrongBox/TEE attestation when available
      preferImmediatelyAvailableCredentials = false
    )

    try {
      val credentialManager = CredentialManager.create(activity)
      val result = credentialManager.createCredential(activity, request)

      val responseJson = JSONObject((result as androidx.credentials.CreatePublicKeyCredentialResponse).registrationResponseJson)
      val response = responseJson.getJSONObject("response")

      promise.resolve(mapOf(
        "credentialId" to responseJson.getString("id"),
        "authenticatorData" to response.getString("authenticatorData"),
        "publicKeyCose" to response.getString("publicKey"),
        "clientDataJSON" to response.getString("clientDataJSON"),
        "attestationObject" to response.getString("attestationObject"),
      ))
    } catch (e: CreateCredentialCancellationException) {
      promise.reject(CodedException("USER_CANCELED", "User canceled passkey creation", e))
    } catch (e: CreateCredentialException) {
      promise.reject(CodedException("CREATE_FAILED", e.message ?: "Unknown error", e))
    }
  }

  // ─── Sign ──────────────────────────────────────────────────────────────────

  private suspend fun signWithPasskeyInternal(
    rpId: String,
    credentialId: String,
    challenge: String,
    promise: Promise
  ) {
    val activity = appContext.activityProvider?.currentActivity
      ?: return promise.reject(CodedException("NO_ACTIVITY", "No foreground activity", null))

    val requestJson = buildGetRequestJson(rpId, credentialId, challenge)
    val option = GetPublicKeyCredentialOption(requestJson = requestJson)
    val request = GetCredentialRequest(credentialOptions = listOf(option))

    try {
      val credentialManager = CredentialManager.create(activity)
      val result = credentialManager.getCredential(activity, request)

      val credential = result.credential as? PublicKeyCredential
        ?: return promise.reject(CodedException("WRONG_CREDENTIAL_TYPE", "Expected PublicKeyCredential", null))

      val responseJson = JSONObject(credential.authenticationResponseJson)
      val response = responseJson.getJSONObject("response")

      val out = mutableMapOf(
        "credentialId" to responseJson.getString("id"),
        "authenticatorData" to response.getString("authenticatorData"),
        "clientDataJSON" to response.getString("clientDataJSON"),
        "signature" to response.getString("signature"),
      )
      if (response.has("userHandle")) {
        out["userHandle"] = response.getString("userHandle")
      }
      promise.resolve(out)
    } catch (e: GetCredentialCancellationException) {
      promise.reject(CodedException("USER_CANCELED", "User canceled passkey sign", e))
    } catch (e: GetCredentialException) {
      promise.reject(CodedException("SIGN_FAILED", e.message ?: "Unknown error", e))
    }
  }

  // ─── JSON builders ─────────────────────────────────────────────────────────

  private fun buildCreateRequestJson(
    rpId: String,
    userId: String,
    userName: String,
    challenge: String
  ): String = JSONObject().apply {
    put("challenge", challenge)
    put("rp", JSONObject().apply {
      put("id", rpId)
      put("name", "Conduit")
    })
    put("user", JSONObject().apply {
      put("id", userId)
      put("name", userName)
      put("displayName", userName)
    })
    put("pubKeyCredParams", JSONArray().apply {
      put(JSONObject().apply { put("type", "public-key"); put("alg", -7) }) // ES256
    })
    put("authenticatorSelection", JSONObject().apply {
      put("authenticatorAttachment", "platform")
      put("residentKey", "required")
      put("userVerification", "required")
    })
    put("attestation", "none")
    put("timeout", 60000)
  }.toString()

  private fun buildGetRequestJson(
    rpId: String,
    credentialId: String,
    challenge: String
  ): String = JSONObject().apply {
    put("challenge", challenge)
    put("rpId", rpId)
    put("allowCredentials", JSONArray().apply {
      put(JSONObject().apply {
        put("type", "public-key")
        put("id", credentialId)
      })
    })
    put("userVerification", "required")
    put("timeout", 60000)
  }.toString()
}
