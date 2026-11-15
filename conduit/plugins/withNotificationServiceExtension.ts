/**
 * Expo config plugin — iOS Notification Service Extension
 *
 * Adds a UNNotificationServiceExtension target ("ConduitNSE") to the Xcode
 * project so the app can decrypt push notification previews before they
 * appear in the notification tray.
 *
 * What this plugin does at `expo prebuild`:
 *   1. Copies the Swift source and Info.plist into ios/ConduitNSE/
 *   2. Adds the NSE target to ios/<app>.xcodeproj/project.pbxproj
 *   3. Adds com.apple.security.application-groups to both the main app
 *      and the NSE so they share the keychain group.
 */

import {
  type ConfigPlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} from '@expo/config-plugins';
import * as fs   from 'fs';
import * as path from 'path';

const NSE_TARGET_NAME   = 'ConduitNSE';
const APP_GROUP_ID      = 'group.com.conduit.app';
const BUNDLE_IDENTIFIER = 'com.conduit.app.nse';
const SWIFT_VERSION     = '5.0';
const DEPLOYMENT_TARGET = '16.0';
const SRC_DIR           = path.join(__dirname, '..', 'extensions', 'NotificationService');

// ─── 1. Copy NSE source files ─────────────────────────────────────────────────

function withNseCopyFiles(config: Parameters<ConfigPlugin>[0]) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const nseDir = path.join(cfg.modRequest.platformProjectRoot, NSE_TARGET_NAME);
      fs.mkdirSync(nseDir, { recursive: true });

      for (const file of ['NotificationService.swift', 'Info.plist', 'NotificationService.entitlements']) {
        const src  = path.join(SRC_DIR, file);
        const dest = path.join(nseDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
      return cfg;
    },
  ]);
}

// ─── 2. Add NSE target to Xcode project ──────────────────────────────────────

function withNseXcodeTarget(config: Parameters<ConfigPlugin>[0]) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;

    // Guard: don't add twice
    if (xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) {
      return cfg;
    }

    const nseTarget = xcodeProject.addTarget(
      NSE_TARGET_NAME,
      'app_extension',
      NSE_TARGET_NAME,
      BUNDLE_IDENTIFIER,
    );

    // Build settings
    xcodeProject.addBuildProperty('SWIFT_VERSION',             SWIFT_VERSION,     'Release', NSE_TARGET_NAME);
    xcodeProject.addBuildProperty('SWIFT_VERSION',             SWIFT_VERSION,     'Debug',   NSE_TARGET_NAME);
    xcodeProject.addBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', DEPLOYMENT_TARGET, 'Release', NSE_TARGET_NAME);
    xcodeProject.addBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', DEPLOYMENT_TARGET, 'Debug',   NSE_TARGET_NAME);
    xcodeProject.addBuildProperty('CODE_SIGN_ENTITLEMENTS',
      `${NSE_TARGET_NAME}/NotificationService.entitlements`, 'Release', NSE_TARGET_NAME);
    xcodeProject.addBuildProperty('CODE_SIGN_ENTITLEMENTS',
      `${NSE_TARGET_NAME}/NotificationService.entitlements`, 'Debug',   NSE_TARGET_NAME);

    // Add Swift source file to the build phase
    xcodeProject.addSourceFile(
      `${NSE_TARGET_NAME}/NotificationService.swift`,
      { target: nseTarget.uuid },
    );
    // Add Info.plist as a resource
    xcodeProject.addResourceFile(
      `${NSE_TARGET_NAME}/Info.plist`,
      { target: nseTarget.uuid },
    );

    return cfg;
  });
}

// ─── 3. App group entitlements on main target ─────────────────────────────────

function withMainAppGroup(config: Parameters<ConfigPlugin>[0]) {
  return withEntitlementsPlist(config, (cfg) => {
    const entitlements = cfg.modResults;
    const existing = (entitlements['com.apple.security.application-groups'] as string[]) ?? [];
    if (!existing.includes(APP_GROUP_ID)) {
      entitlements['com.apple.security.application-groups'] = [...existing, APP_GROUP_ID];
    }
    return cfg;
  });
}

// ─── 4. Add push notification capability to Info.plist ───────────────────────

function withRemoteNotificationBackground(config: Parameters<ConfigPlugin>[0]) {
  return withInfoPlist(config, (cfg) => {
    const modes: string[] = cfg.modResults['UIBackgroundModes'] ?? [];
    if (!modes.includes('remote-notification')) {
      cfg.modResults['UIBackgroundModes'] = [...modes, 'remote-notification'];
    }
    return cfg;
  });
}

// ─── Compose ──────────────────────────────────────────────────────────────────

const withNotificationServiceExtension: ConfigPlugin = (config) => {
  config = withNseCopyFiles(config);
  config = withNseXcodeTarget(config);
  config = withMainAppGroup(config);
  config = withRemoteNotificationBackground(config);
  return config;
};

export default withNotificationServiceExtension;
