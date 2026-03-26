import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';
import type { Episode } from '../types';
import { EpisodeArtwork } from './EpisodeArtwork';

interface Props {
  episode: Episode;
  detail: string;
}

export function EpisodeContextCard({ episode, detail }: Props) {
  return (
    <View style={styles.container}>
      <EpisodeArtwork uri={episode.imageUrl} style={styles.artwork} />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {episode.title}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#121415',
    padding: 10,
    gap: 12,
  },
  artwork: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#1b211d',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  detail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
