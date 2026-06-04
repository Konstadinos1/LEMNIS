import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '@/lib/notifications';

// Configure how notifications are handled while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request push notification permissions and register the device token
 * with the Conduit backend.  Must be called after the user is authenticated
 * (the registration call requires a valid session JWT).
 *
 * Safe to call multiple times — subsequent calls are no-ops if a token is
 * already registered.
 */
export async function setupPushNotifications(): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: false,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    // Get the raw device token (APNs on iOS, FCM on Android)
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    await registerPushToken(tokenData.data, platform);
  } catch {
    // Push registration failure is non-fatal — app works without it
  }
}

/**
 * Hook that runs push notification setup once after mount.
 * Place in a screen that's only rendered while authenticated.
 */
export function usePushNotifications() {
  useEffect(() => {
    void setupPushNotifications();
  }, []);
}
