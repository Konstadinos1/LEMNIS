package expo.modules.conduitsecurity

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ConduitSecurityModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("ConduitSecurity")

    AsyncFunction("getSecurityReport") {
      val ctx = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No context", null)
      SecurityAuditor(ctx).fullReport()
    }

    AsyncFunction("isJailbroken") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      SecurityAuditor(ctx).isRooted()
    }

    AsyncFunction("isDebuggerAttached") {
      SecurityAuditor.isDebuggerAttached()
    }

    AsyncFunction("isFridaDetected") {
      SecurityAuditor.isFridaDetected()
    }

    AsyncFunction("isRunningInSimulator") {
      SecurityAuditor.isEmulator()
    }

    Function("enableScreenshotProtection") { enable: Boolean ->
      val activity = appContext.activityProvider?.currentActivity ?: return@Function
      activity.runOnUiThread {
        if (enable) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
      }
    }
  }
}

// ─── SecurityAuditor ─────────────────────────────────────────────────────────

class SecurityAuditor(private val context: Context) {

  fun fullReport(): Map<String, Any> = mapOf(
    "jailbroken"        to isRooted(),
    "debuggerAttached"  to isDebuggerAttached(),
    "fridaDetected"     to isFridaDetected(),
    "simulator"         to isEmulator(),
    "reverseEngineered" to isFridaDetected(),
  )

  // ── Root detection ────────────────────────────────────────────────────────

  fun isRooted(): Boolean =
    checkSuBinaries()
      || checkRootApps()
      || checkDangerousProperties()
      || checkRWSystem()
      || checkTestKeys()

  private fun checkSuBinaries(): Boolean {
    val paths = listOf(
      "/data/local/bin/su", "/data/local/su", "/data/local/xbin/su",
      "/sbin/su", "/su/bin/su", "/system/app/Superuser.apk",
      "/system/bin/.ext/.su", "/system/bin/failsafe/su", "/system/bin/su",
      "/system/etc/init.d/99SuperSUDaemon", "/system/sd/xbin/su",
      "/system/usr/we-need-root/su-backup", "/system/xbin/su",
      "/system/xbin/mu",
    )
    return paths.any { File(it).exists() }
  }

  private fun checkRootApps(): Boolean {
    val packages = listOf(
      "com.noshufou.android.su",
      "com.noshufou.android.su.elite",
      "eu.chainfire.supersu",
      "com.koushikdutta.superuser",
      "com.thirdparty.superuser",
      "com.yellowes.su",
      "com.topjohnwu.magisk",
      "com.kingroot.kinguser",
      "com.kingo.root",
      "com.smedialink.oneclickroot",
      "com.zhiqupk.root.global",
      "com.alephzain.framaroot",
    )
    val pm = context.packageManager
    return packages.any { pkg ->
      try {
        pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES)
        true
      } catch (_: PackageManager.NameNotFoundException) {
        false
      }
    }
  }

  private fun checkDangerousProperties(): Boolean {
    return try {
      val process = Runtime.getRuntime().exec(arrayOf("getprop"))
      val output = process.inputStream.bufferedReader().readText()
      process.waitFor()
      output.contains("[ro.debuggable]: [1]") || output.contains("[ro.secure]: [0]")
    } catch (_: Exception) {
      false
    }
  }

  private fun checkRWSystem(): Boolean {
    return try {
      val process = Runtime.getRuntime().exec(arrayOf("mount"))
      val output = process.inputStream.bufferedReader().readText()
      process.waitFor()
      output.contains("/system rw") || output.contains("/system ext3 rw")
    } catch (_: Exception) {
      false
    }
  }

  private fun checkTestKeys(): Boolean {
    val tags = Build.TAGS ?: return false
    return tags.contains("test-keys") || tags.contains("dev-keys")
  }

  // ── Emulator detection ────────────────────────────────────────────────────

  companion object {
    fun isEmulator(): Boolean {
      val emulatorFingerprints = listOf(
        "generic", "unknown", "google_sdk", "emulator", "Android SDK built for x86",
      )
      return Build.FINGERPRINT.startsWith("generic")
          || Build.FINGERPRINT.startsWith("unknown")
          || Build.MODEL.contains("google_sdk")
          || Build.MODEL.contains("Emulator")
          || Build.MODEL.contains("Android SDK built for x86")
          || Build.MANUFACTURER.contains("Genymotion")
          || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
          || Build.PRODUCT == "google_sdk"
          || Build.HARDWARE == "goldfish"
          || Build.HARDWARE == "ranchu"
    }

    // ── Debugger detection ────────────────────────────────────────────────

    fun isDebuggerAttached(): Boolean {
      return android.os.Debug.isDebuggerConnected()
          || android.os.Debug.waitingForDebugger()
    }

    // ── Frida detection ───────────────────────────────────────────────────

    fun isFridaDetected(): Boolean =
      checkFridaPort()
        || checkFridaLibraries()
        || checkFridaProcesses()

    private fun checkFridaPort(): Boolean {
      return try {
        val socket = java.net.Socket()
        socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 50)
        socket.close()
        true
      } catch (_: Exception) {
        false
      }
    }

    private fun checkFridaLibraries(): Boolean {
      val suspiciousLibs = listOf(
        "frida", "fridagadget", "gum-js-loop", "gmain", "linjector",
        "libfrida", "re.frida.server",
      )
      return try {
        val maps = File("/proc/self/maps").readText()
        suspiciousLibs.any { maps.contains(it, ignoreCase = true) }
      } catch (_: Exception) {
        false
      }
    }

    private fun checkFridaProcesses(): Boolean {
      return try {
        val process = Runtime.getRuntime().exec(arrayOf("ps", "-A"))
        val output = process.inputStream.bufferedReader().readText()
        process.waitFor()
        output.contains("frida-server") || output.contains("frida-helper")
      } catch (_: Exception) {
        false
      }
    }
  }
}
