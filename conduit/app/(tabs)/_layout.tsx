import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{ title: 'Chats', tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: 'Wallet', tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Discover', tabBarIcon: () => null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg.elevated,
    borderTopColor: colors.border.default,
    height: 80,
    paddingBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as '600',
  },
});
