import ExpoModulesCore
import AuthenticationServices
import LocalAuthentication

// MARK: - Module

public class ExpoPasskeysModule: Module {

  public func definition() -> ModuleDefinition {
    Name("ExpoPasskeys")

    AsyncFunction("isPasskeySupported") { () -> Bool in
      if #available(iOS 16.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("createPasskey") {
      (rpId: String, userId: String, userName: String, challenge: String,
       promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("UNSUPPORTED", "Passkeys require iOS 16+")
        return
      }
      PasskeyController.shared.create(
        rpId: rpId,
        userId: userId,
        userName: userName,
        challenge: challenge,
        promise: promise
      )
    }

    AsyncFunction("signWithPasskey") {
      (rpId: String, credentialId: String, challenge: String,
       promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("UNSUPPORTED", "Passkeys require iOS 16+")
        return
      }
      PasskeyController.shared.sign(
        rpId: rpId,
        credentialId: credentialId,
        challenge: challenge,
        promise: promise
      )
    }
  }
}

// MARK: - Controller

@available(iOS 16.0, *)
class PasskeyController: NSObject,
  ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding {

  static let shared = PasskeyController()
  private var pendingPromise: Promise?
  private var operationType: OperationType = .create

  enum OperationType { case create, sign }

  // MARK: Create

  func create(
    rpId: String,
    userId: String,
    userName: String,
    challenge: String,
    promise: Promise
  ) {
    guard let challengeData = Data(base64urlEncoded: challenge),
          let userIdData = Data(base64urlEncoded: userId) else {
      promise.reject("INVALID_ARGS", "challenge or userId is not valid base64url")
      return
    }

    pendingPromise = promise
    operationType = .create

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
      relyingPartyIdentifier: rpId
    )
    let request = provider.createCredentialRegistrationRequest(
      challenge: challengeData,
      name: userName,
      userID: userIdData
    )
    request.attestationPreference = .none
    // Prefer iCloud Keychain (cross-device) but allow local SE only
    request.userVerificationPreference = .required

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  // MARK: Sign

  func sign(
    rpId: String,
    credentialId: String,
    challenge: String,
    promise: Promise
  ) {
    guard let challengeData = Data(base64urlEncoded: challenge),
          let credentialIdData = Data(base64urlEncoded: credentialId) else {
      promise.reject("INVALID_ARGS", "challenge or credentialId is not valid base64url")
      return
    }

    pendingPromise = promise
    operationType = .sign

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
      relyingPartyIdentifier: rpId
    )
    let request = provider.createCredentialAssertionRequest(
      challenge: challengeData
    )
    request.allowedCredentials = [
      ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: credentialIdData)
    ]
    request.userVerificationPreference = .required

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  // MARK: - ASAuthorizationControllerDelegate

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard let promise = pendingPromise else { return }
    pendingPromise = nil

    switch operationType {

    case .create:
      guard let registration = authorization.credential
        as? ASAuthorizationPlatformPublicKeyCredentialRegistration else {
        promise.reject("UNEXPECTED_CREDENTIAL_TYPE", "Expected registration credential")
        return
      }

      let result: [String: String] = [
        "credentialId": registration.credentialID.base64urlEncodedString(),
        "authenticatorData": registration.rawAuthenticatorData?.base64urlEncodedString() ?? "",
        "publicKeyCose": registration.rawAttestationObject?.base64urlEncodedString() ?? "",
        "clientDataJSON": registration.rawClientDataJSON.base64urlEncodedString(),
        "attestationObject": registration.rawAttestationObject?.base64urlEncodedString() ?? "",
      ]
      promise.resolve(result)

    case .sign:
      guard let assertion = authorization.credential
        as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
        promise.reject("UNEXPECTED_CREDENTIAL_TYPE", "Expected assertion credential")
        return
      }

      var result: [String: String] = [
        "credentialId": assertion.credentialID.base64urlEncodedString(),
        "authenticatorData": assertion.rawAuthenticatorData.base64urlEncodedString(),
        "clientDataJSON": assertion.rawClientDataJSON.base64urlEncodedString(),
        "signature": assertion.signature.base64urlEncodedString(),
      ]
      if let handle = assertion.userID {
        result["userHandle"] = handle.base64urlEncodedString()
      }
      promise.resolve(result)
    }
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    guard let promise = pendingPromise else { return }
    pendingPromise = nil

    let asError = error as? ASAuthorizationError
    switch asError?.code {
    case .canceled:
      promise.reject("USER_CANCELED", "User canceled the passkey operation")
    case .failed:
      promise.reject("FAILED", error.localizedDescription)
    case .notInteractive:
      promise.reject("NOT_INTERACTIVE", "Passkey operation requires user interaction")
    default:
      promise.reject("PASSKEY_ERROR", error.localizedDescription)
    }
  }

  // MARK: - ASAuthorizationControllerPresentationContextProviding

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    // Walk the key window — safe on main thread since performRequests is dispatched there
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? UIWindow()
  }
}

// MARK: - Base64url helpers

extension Data {
  init?(base64urlEncoded string: String) {
    var base64 = string
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64 += "=" }
    self.init(base64Encoded: base64)
  }

  func base64urlEncodedString() -> String {
    return self.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
