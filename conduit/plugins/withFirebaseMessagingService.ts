/**
 * Expo config plugin — Android Firebase Messaging Service
 *
 * Registers ConduitFirebaseMessagingService in AndroidManifest.xml and
 * copies the Kotlin source file into the correct package directory.
 */

import {
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
} from '@expo/config-plugins';
import * as fs   from 'fs';
import * as path from 'path';

const SERVICE_CLASS  = 'com.conduit.app.ConduitFirebaseMessagingService';
const KT_SOURCE      = path.join(__dirname, '..', 'android-messaging', 'ConduitFirebaseMessagingService.kt');

function withFcmServiceManifest(config: Parameters<ConfigPlugin>[0]) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    // Guard: don't add twice
    const services = (app.service ?? []) as Array<{ $: Record<string, string> }>;
    const alreadyAdded = services.some((s) => s.$['android:name'] === SERVICE_CLASS);
    if (alreadyAdded) return cfg;

    app.service = [
      ...services,
      {
        $: {
          'android:name':       SERVICE_CLASS,
          'android:exported':   'false',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
          },
        ],
      } as any,
    ];

    return cfg;
  });
}

function withFcmServiceKotlinSource(config: Parameters<ConfigPlugin>[0]) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkgDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'com', 'conduit', 'app',
      );
      fs.mkdirSync(pkgDir, { recursive: true });
      if (fs.existsSync(KT_SOURCE)) {
        fs.copyFileSync(KT_SOURCE, path.join(pkgDir, 'ConduitFirebaseMessagingService.kt'));
      }
      return cfg;
    },
  ]);
}

const withFirebaseMessagingService: ConfigPlugin = (config) => {
  config = withFcmServiceManifest(config);
  config = withFcmServiceKotlinSource(config);
  return config;
};

export default withFirebaseMessagingService;
