import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { colors, spacing, typography } from '@/theme/tokens';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function Icon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, [string, string]> = {
    Chats: ['💬', '🗨️'],
    Wallet: ['💳', '💰'],
    Discover: ['🔍', '🔎'],
    Settings: ['⚙️', '⚙️'],
  };
  const [inactive, active] = icons[label] ?? ['○', '●'];
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {focused ? active : inactive}
    </Text>
  );
}

export default function TabsLayout() {
  usePushNotifications();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: styles.label,
        tabBarIcon: ({ focused }) => <Icon label={route.name} focused={focused} />,
      })}
    >
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg.elevated,
    borderTopColor: colors.border.default,
    height: 82,
    paddingBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as '600',
  },
});
