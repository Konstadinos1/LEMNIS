import UserNotifications
import CryptoKit
import Security

/**
 * Conduit Notification Service Extension
 *
 * Intercepts APNs pushes before they reach the notification tray and
 * decrypts the `encrypted_preview` field using the device's notification
 * preview key (stored in the shared keychain group).
 *
 * The full message content is NOT decrypted here — that happens in the
 * main app via the Double Ratchet. This extension only shows a short
 * plaintext snippet (sender + truncated text) while keeping full
 * forward-secrecy for message content intact.
 *
 * App group: group.com.conduit.app (shared keychain access group)
 */
class NotificationService: UNNotificationServiceExtension {

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler  = contentHandler
    bestAttemptContent   = (request.content.mutableCopy() as? UNMutableNotificationContent)

    guard let content = bestAttemptContent else {
      contentHandler(request.content)
      return
    }

    let userInfo = request.content.userInfo

    // Required fields from relay push payload
    guard
      let encryptedPreview = userInfo["encrypted_preview"] as? String,
      !encryptedPreview.isEmpty
    else {
      // No encrypted preview — show generic placeholder
      content.title = "Conduit"
      content.body  = "New encrypted message"
      contentHandler(content)
      return
    }

    // Sender display name (already plaintext — not sensitive metadata)
    let senderName = userInfo["sender_name"] as? String ?? "Someone"
    let threadId   = userInfo["thread_id"]   as? String ?? ""

    // Load preview key from shared keychain
    guard let previewKeyData = loadPreviewKey() else {
      content.title = senderName
      content.body  = "New encrypted message"
      contentHandler(content)
      return
    }

    do {
      let preview = try decryptPreview(
        encryptedPreview: encryptedPreview,
        keyData: previewKeyData
      )
      content.title           = senderName
      content.body            = preview
      content.threadIdentifier = threadId
    } catch {
      content.title = senderName
      content.body  = "New encrypted message"
    }

    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let handler = contentHandler, let content = bestAttemptContent {
      content.body = "New encrypted message"
      handler(content)
    }
  }

  // MARK: - Keychain

  private func loadPreviewKey() -> Data? {
    let query: [CFString: Any] = [
      kSecClass:            kSecClassGenericPassword,
      kSecAttrService:      "conduit.notif.previewKey",
      kSecAttrAccessGroup:  "group.com.conduit.app",
      kSecReturnData:       true,
      kSecMatchLimit:       kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    // Stored as JSON: {"key": "<base64>", "createdAt": <ms>}
    guard
      let json   = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let keyB64 = json["key"] as? String,
      let keyData = Data(base64Encoded: keyB64),
      keyData.count == 32
    else { return nil }
    return keyData
  }

  // MARK: - Decryption

  private func decryptPreview(encryptedPreview: String, keyData: Data) throws -> String {
    // Wire format: base64(nonce[12] || ciphertext[N] || tag[16])
    guard let raw = Data(base64Encoded: encryptedPreview), raw.count > 28 else {
      throw NSError(domain: "ConduitNSE", code: 1, userInfo: [NSLocalizedDescriptionKey: "Preview too short"])
    }

    let nonce      = raw.subdata(in: 0..<12)
    let tagOffset  = raw.count - 16
    let ciphertext = raw.subdata(in: 12..<tagOffset)
    let tag        = raw.subdata(in: tagOffset..<raw.count)

    let symKey = SymmetricKey(data: keyData)
    let sealedBox = try AES.GCM.SealedBox(
      nonce:      AES.GCM.Nonce(data: nonce),
      ciphertext: ciphertext,
      tag:        tag
    )
    let plaintext = try AES.GCM.open(sealedBox, using: symKey)
    return String(data: plaintext, encoding: .utf8) ?? "New message"
  }
}
