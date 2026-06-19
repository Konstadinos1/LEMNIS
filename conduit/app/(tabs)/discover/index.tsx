import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { colors, spacing, typography } from '@/theme/tokens';

export default function DiscoverScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Find people and communities on Conduit.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: { flex: 1, padding: spacing.xl, gap: spacing.md },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
  },
});
