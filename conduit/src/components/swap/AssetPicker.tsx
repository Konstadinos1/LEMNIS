import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { TokenInfo } from '@/types/wallet';

const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.conduit.app';

async function fetchAllowlist(): Promise<TokenInfo[]> {
  const res = await fetch(`${API}/api/tokens/allowlist?chainId=8453`);
  if (!res.ok) throw new Error('Failed to fetch token list');
  const data = await res.json() as { tokens: TokenInfo[] };
  return data.tokens;
}

interface Props {
  selected?: TokenInfo;
  excluded?: TokenInfo;
  onSelect: (token: TokenInfo) => void;
  label: string;
}

export function AssetPicker({ selected, excluded, onSelect, label }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['allowlist'],
    queryFn: fetchAllowlist,
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return tokens.filter(
      (t) =>
        t.address !== excluded?.address &&
        (q === '' || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    );
  }, [tokens, query, excluded]);

  const handleSelect = useCallback(
    (token: TokenInfo) => {
      onSelect(token);
      setOpen(false);
      setQuery('');
    },
    [onSelect]
  );

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.tokenBadge}>
          <Text style={styles.symbol}>{selected?.symbol ?? 'Select'}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      {open && (
        <View style={styles.dropdown}>
          <TextInput
            style={styles.search}
            placeholder="Search tokens…"
            placeholderTextColor={colors.text.tertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {isLoading ? (
            <ActivityIndicator color={colors.brand.primary} style={styles.spinner} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(t) => t.address}
              renderItem={({ item }) => (
                <Pressable style={styles.tokenRow} onPress={() => handleSelect(item)}>
                  <View style={styles.tokenInfo}>
                    <Text style={styles.tokenSymbol}>{item.symbol}</Text>
                    <Text style={styles.tokenName}>{item.name}</Text>
                  </View>
                </Pressable>
              )}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
            />
          )}
          <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flex: 1,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  symbol: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  chevron: { color: colors.text.tertiary, fontSize: typography.size.md },

  dropdown: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    zIndex: 200,
    gap: spacing.sm,
  },
  search: {
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.size.base,
  },
  list: { flex: 1 },
  spinner: { marginTop: spacing.lg },
  tokenRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  tokenInfo: { gap: 2 },
  tokenSymbol: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  tokenName: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  closeBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  closeBtnText: {
    color: colors.brand.primary,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium as '500',
  },
});
