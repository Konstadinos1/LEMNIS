import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { hasIdentity, getMyFingerprint } from '@/lib/crypto/identity';
import { loadSmartAccount } from '@/lib/wallet/smartAccount';
import { useWalletStore } from '@/store/wallet';
import { ensureApiSession } from '@/lib/api/auth';
import { getSecurityReport } from 'conduit-security';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

function AppNavigator() {
  const [ready, setReady] = useState(false);
  const setAccount = useWalletStore((s) => s.setAccount);
  const setMyFingerprint = useWalletStore((s) => s.setMyFingerprint);

  useEffect(() => {
    async function bootstrap() {
      try {
        // Security gate — warn on compromised devices; block if Frida detected
        const security = await getSecurityReport().catch(() => null);
        if (security?.fridaDetected || security?.reverseEngineered) {
          Alert.alert(
            'Security Alert',
            'A reverse-engineering tool has been detected. Conduit cannot run safely.',
            [{ text: 'Exit', onPress: () => { throw new Error('security_block'); } }],
            { cancelable: false },
          );
          return;
        }

        const [hasId, account, fingerprint] = await Promise.all([
          hasIdentity(),
          loadSmartAccount(),
          getMyFingerprint(),
        ]);

        if (account) setAccount(account);
        setMyFingerprint(fingerprint);

        if (!hasId || !account) {
          router.replace('/(auth)/onboarding');
        } else {
          // Warm up API session in background — re-acquired on first 401 if stale
          void ensureApiSession().catch(() => {});
          router.replace('/(tabs)/chats');
        }
      } catch {
        router.replace('/(auth)/onboarding');
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }

    bootstrap();
  }, [setAccount, setMyFingerprint]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" />
        <AppNavigator />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
