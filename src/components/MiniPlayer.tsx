import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../context/AudioContext';
import { colors, radii } from '../constants/theme';
import type { Episode } from '../types';

interface Props {
  episode: Episode;
  onPress: () => void;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

export function MiniPlayer({ episode, onPress }: Props) {
  const audio = useAudio();
  const progress = audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.content}>
        {episode.imageUrl ? (
          <Image source={{ uri: episode.imageUrl }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons name="headset" size={15} color={colors.textDim} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{episode.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatTime(audio.currentTime)} played · tap to reopen
          </Text>
        </View>

        <Pressable
          style={styles.playBtn}
          onPress={(event) => {
            event.stopPropagation();
            if (audio.isPlaying) {
              audio.pause();
            } else {
              void audio.resume();
            }
          }}
        >
          <Ionicons
            name={audio.isPlaying ? 'pause' : 'play'}
            size={17}
            color={colors.textPrimary}
            style={audio.isPlaying ? undefined : { marginLeft: 2 }}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,14,18,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  meta: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
  },
});
