package com.conduit.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

/**
 * Conduit FCM data message handler.
 *
 * Receives data-only FCM messages from the relay, decrypts the
 * `encrypted_preview` field using the device's notification preview key
 * (stored in SharedPreferences, written by the React Native layer via
 * the `conduit.notif.previewKey` SecureStore entry), and posts a local
 * notification with the decrypted preview text.
 *
 * The full message content is NOT handled here. The Double Ratchet
 * decryption happens in the main app when the user opens the thread.
 */
class ConduitFirebaseMessagingService : FirebaseMessagingService() {

  companion object {
    private const val CHANNEL_ID       = "conduit_messages"
    private const val CHANNEL_NAME     = "Messages"
    private const val PREF_FILE        = "conduit_secure_prefs"
    private const val PREF_PREVIEW_KEY = "conduit.notif.previewKey"
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data.isEmpty()) return

    val encryptedPreview = data["encrypted_preview"] ?: return
    val senderName       = data["sender_name"]       ?: "Someone"
    val threadId         = data["thread_id"]         ?: ""

    val previewText = try {
      val keyBytes = loadPreviewKey() ?: run {
        return showNotification(senderName, "New encrypted message", threadId)
      }
      decryptPreview(encryptedPreview, keyBytes)
    } catch (_: Exception) {
      "New encrypted message"
    }

    showNotification(senderName, previewText, threadId)
  }

  override fun onNewToken(token: String) {
    // Token refresh — the React Native layer handles re-registration
    // via react-native-firebase's onTokenRefresh callback.
    // Store the new token so the JS layer can pick it up on next launch.
    getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
      .edit()
      .putString("conduit.notif.pendingToken", token)
      .apply()
  }

  // ── Preview key loading ────────────────────────────────────────────────────

  private fun loadPreviewKey(): ByteArray? {
    // The React Native SecureStore writes to encrypted SharedPreferences.
    // The key is stored as JSON: {"key":"<base64>","createdAt":<ms>}
    val prefs = getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
    val raw   = prefs.getString(PREF_PREVIEW_KEY, null) ?: return null
    return try {
      val json   = JSONObject(raw)
      val keyB64 = json.getString("key")
      val key    = Base64.decode(keyB64, Base64.DEFAULT)
      if (key.size == 32) key else null
    } catch (_: Exception) {
      null
    }
  }

  // ── Decryption ─────────────────────────────────────────────────────────────

  /**
   * Wire format: base64(nonce[12] || ciphertext[N] || tag[16])
   * Matches the iOS NSE and the TypeScript encryptPreview() function.
   */
  private fun decryptPreview(encryptedBase64: String, keyBytes: ByteArray): String {
    val raw = Base64.decode(encryptedBase64, Base64.DEFAULT)
    require(raw.size > 28) { "Preview ciphertext too short" }

    val nonce      = raw.copyOfRange(0, 12)
    val tagOffset  = raw.size - 16
    // AES/GCM/NoPadding expects ciphertext + tag concatenated
    val ctWithTag  = raw.copyOfRange(12, raw.size)

    val secretKey  = SecretKeySpec(keyBytes, "AES")
    val gcmSpec    = GCMParameterSpec(128, nonce)
    val cipher     = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)

    val plaintext  = cipher.doFinal(ctWithTag)
    return String(plaintext, Charsets.UTF_8).take(100)
  }

  // ── Notification display ───────────────────────────────────────────────────

  private fun showNotification(title: String, body: String, threadId: String) {
    ensureNotificationChannel()

    val intent = packageManager
      .getLaunchIntentForPackage(packageName)
      ?.apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("thread_id", threadId)
      }

    val pendingIntent = PendingIntent.getActivity(
      this, threadId.hashCode(), intent ?: Intent(),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_email)  // replace with real icon
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    NotificationManagerCompat.from(this)
      .notify(threadId.hashCode(), notification)
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "End-to-end encrypted messages"
    }
    getSystemService(NotificationManager::class.java)
      .createNotificationChannel(channel)
  }
}
