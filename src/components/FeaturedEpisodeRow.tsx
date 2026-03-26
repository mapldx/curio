import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import type { Episode } from '../types';

interface Props {
  episode: Episode;
  topicLabel: string;
  onPlay: () => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} min`;
}

export function FeaturedEpisodeRow({ episode, topicLabel, onPlay }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.artworkColumn}>
        {episode.imageUrl ? (
          <Image source={{ uri: episode.imageUrl }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <View style={[styles.fallbackBlock, styles.fallbackMint]} />
            <View style={[styles.fallbackBlock, styles.fallbackClay]} />
          </View>
        )}
      </View>

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {(episode.podcastName || 'Podcast')} · {formatDuration(episode.duration)} ·{' '}
          <Text style={styles.topic}>{topicLabel}</Text>
        </Text>
        <Text style={styles.description} numberOfLines={3}>
          {episode.description || 'Listen in and ask Curio follow-up questions about this episode.'}
        </Text>

        <View style={styles.actions}>
          <Pressable style={styles.playButton} onPress={onPlay}>
            <Ionicons name="play" size={14} color="#11110f" style={styles.playIcon} />
            <Text style={styles.playText}>Play</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'stretch',
  },
  artwork: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: colors.panelRaised,
  },
  artworkFallback: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  fallbackBlock: {
    width: 28,
    borderRadius: 14,
  },
  fallbackMint: {
    height: 66,
    backgroundColor: '#39453d',
  },
  fallbackClay: {
    height: 54,
    backgroundColor: '#2d2821',
  },
  copy: {
    flex: 1.05,
    minWidth: 0,
    paddingTop: 2,
    justifyContent: 'space-between',
  },
  artworkColumn: {
    flex: 1,
    maxWidth: '42%',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  topic: {
    color: colors.accentText,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  playButton: {
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1ebe2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  playIcon: {
    marginRight: 6,
    marginLeft: 1,
  },
  playText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#11110f',
  },
});
