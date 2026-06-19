import ExpoModulesCore
import Foundation
import UIKit

// MARK: - Module

public class ConduitSecurityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ConduitSecurity")

    AsyncFunction("getSecurityReport") { () -> [String: Any] in
      return SecurityAuditor.shared.fullReport()
    }

    AsyncFunction("isJailbroken") { () -> Bool in
      SecurityAuditor.shared.isJailbroken()
    }

    AsyncFunction("isDebuggerAttached") { () -> Bool in
      SecurityAuditor.shared.isDebuggerAttached()
    }

    AsyncFunction("isFridaDetected") { () -> Bool in
      SecurityAuditor.shared.isFridaDetected()
    }

    AsyncFunction("isRunningInSimulator") { () -> Bool in
      SecurityAuditor.shared.isSimulator()
    }

    Function("enableScreenshotProtection") { (enable: Bool) in
      ScreenshotProtection.shared.setEnabled(enable)
    }
  }
}

// MARK: - SecurityAuditor

class SecurityAuditor {
  static let shared = SecurityAuditor()
  private init() {}

  func fullReport() -> [String: Any] {
    [
      "jailbroken":         isJailbroken(),
      "debuggerAttached":   isDebuggerAttached(),
      "fridaDetected":      isFridaDetected(),
      "simulator":          isSimulator(),
      "reverseEngineered":  isFridaDetected() || isDylibInjected(),
    ]
  }

  // MARK: Jailbreak

  func isJailbroken() -> Bool {
    #if targetEnvironment(simulator)
    return false
    #else
    return checkFileSystemArtifacts()
        || checkCypiaScheme()
        || checkDylibSymlinks()
        || checkSandboxWrite()
    #endif
  }

  private func checkFileSystemArtifacts() -> Bool {
    let paths = [
      "/Applications/Cydia.app",
      "/Applications/blackra1n.app",
      "/Applications/FakeCarrier.app",
      "/Applications/Icy.app",
      "/Applications/IntelliScreen.app",
      "/Applications/MxTube.app",
      "/Applications/RockApp.app",
      "/Applications/SBSettings.app",
      "/Applications/WinterBoard.app",
      "/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist",
      "/Library/MobileSubstrate/DynamicLibraries/Veency.plist",
      "/private/var/lib/apt",
      "/private/var/lib/cydia",
      "/private/var/mobile/Library/SBSettings/Themes",
      "/private/var/stash",
      "/private/var/tmp/cydia.log",
      "/System/Library/LaunchDaemons/com.ikey.brickhouse.plist",
      "/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist",
      "/usr/bin/sshd",
      "/usr/libexec/sftp-server",
      "/usr/sbin/sshd",
      "/bin/bash",
      "/etc/apt",
    ]
    for path in paths {
      if FileManager.default.fileExists(atPath: path) { return true }
    }
    return false
  }

  private func checkCypiaScheme() -> Bool {
    guard let url = URL(string: "cydia://package/com.example.package") else { return false }
    return UIApplication.shared.canOpenURL(url)
  }

  private func checkDylibSymlinks() -> Bool {
    let dylibPath = "/Library/MobileSubstrate/MobileSubstrate.dylib"
    return FileManager.default.fileExists(atPath: dylibPath)
  }

  private func checkSandboxWrite() -> Bool {
    let path = "/private/jailbreak_test_\(Int.random(in: 1000...9999))"
    do {
      try "test".write(toFile: path, atomically: true, encoding: .utf8)
      try FileManager.default.removeItem(atPath: path)
      return true
    } catch {
      return false
    }
  }

  // MARK: Debugger

  func isDebuggerAttached() -> Bool {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.size
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
    return (info.kp_proc.p_flag & P_TRACED) != 0
  }

  // MARK: Frida

  func isFridaDetected() -> Bool {
    return checkFridaPort() || checkFridaSymbols() || isDylibInjected()
  }

  private func checkFridaPort() -> Bool {
    // Frida default port 27042
    let socket = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    guard socket >= 0 else { return false }
    defer { Darwin.close(socket) }

    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = in_port_t(27042).bigEndian
    addr.sin_addr.s_addr = inet_addr("127.0.0.1")

    let result = withUnsafePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    return result == 0
  }

  private func checkFridaSymbols() -> Bool {
    let fridaSymbols = [
      "frida_agent_main",
      "_frida_g_bytes_new_static",
      "gum_interceptor_begin_transaction",
    ]
    for sym in fridaSymbols {
      if dlsym(RTLD_DEFAULT, sym) != nil { return true }
    }
    return false
  }

  func isDylibInjected() -> Bool {
    let suspiciousLibs = [
      "FridaGadget",
      "frida",
      "cynject",
      "libcycript",
      "SSLKillSwitch",
      "TweakInject",
      "MobileSubstrate",
      "SubstrateLoader",
      "SubstrateBootstrap",
    ]
    let imageCount = _dyld_image_count()
    for i in 0..<imageCount {
      guard let imageName = _dyld_get_image_name(i) else { continue }
      let name = String(cString: imageName).lowercased()
      for lib in suspiciousLibs {
        if name.contains(lib.lowercased()) { return true }
      }
    }
    return false
  }

  // MARK: Simulator

  func isSimulator() -> Bool {
    #if targetEnvironment(simulator)
    return true
    #else
    return false
    #endif
  }
}

// MARK: - Screenshot Protection

class ScreenshotProtection {
  static let shared = ScreenshotProtection()
  private var textField: UITextField?
  private weak var secureView: UIView?
  private init() {}

  func setEnabled(_ enable: Bool) {
    DispatchQueue.main.async {
      if enable {
        self.install()
      } else {
        self.uninstall()
      }
    }
  }

  private func install() {
    guard secureView == nil,
          let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })
    else { return }

    // Use UITextField's secure text entry layer to block screenshots/recordings
    let field = UITextField()
    field.isSecureTextEntry = true
    field.translatesAutoresizingMaskIntoConstraints = false

    guard let sv = field.layer.sublayers?.first?.delegate as? UIView else { return }
    sv.translatesAutoresizingMaskIntoConstraints = false
    sv.alpha = 0  // invisible but active — blocks screen capture

    window.addSubview(sv)
    NSLayoutConstraint.activate([
      sv.leadingAnchor.constraint(equalTo: window.leadingAnchor),
      sv.trailingAnchor.constraint(equalTo: window.trailingAnchor),
      sv.topAnchor.constraint(equalTo: window.topAnchor),
      sv.bottomAnchor.constraint(equalTo: window.bottomAnchor),
    ])

    textField = field
    secureView = sv
  }

  private func uninstall() {
    secureView?.removeFromSuperview()
    secureView = nil
    textField = nil
  }
}
