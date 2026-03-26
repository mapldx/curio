import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import type { Source } from '../types';

interface Props {
  sources: Source[];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function SourceToast({ sources }: Props) {
  if (sources.length === 0) return null;

  const visibleSources = sources.slice(0, 3);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Ionicons name="globe-outline" size={12} color={colors.accentText} />
        <Text style={styles.label}>Sources</Text>
      </View>
      {visibleSources.map((source, index) => (
        <Pressable
          key={`${source.url}-${index}`}
          style={[styles.sourceRow, index > 0 && styles.sourceRowDivider]}
          onPress={() => Linking.openURL(source.url)}
        >
          <Text style={styles.value} numberOfLines={2}>
            {source.title || getDomain(source.url)}
          </Text>
          <Text style={styles.domain}>{getDomain(source.url)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  sourceRow: {
    paddingVertical: 8,
  },
  sourceRowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  value: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  domain: {
    fontSize: 12,
    color: '#81c393',
  },
});
