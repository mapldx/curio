import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AGENT_DISCLOSURE_TEXT } from '../constants/legal';
import { colors, radii, typography } from '../constants/theme';
import type { Episode } from '../types';
import { EpisodeContextCard } from './EpisodeContextCard';

interface Props {
  episode: Episode;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  currentMomentMode: 'transcript' | 'fallback';
  currentMomentLabel: string;
  currentMomentText: string;
  currentMomentMeta?: string | null;
  currentMomentScrollProgress: number;
  onSeek: (time: number) => void;
  onSkipBack: () => void;
  onTogglePlayback: () => void;
  onSkipForward: () => void;
  onAsk: () => void;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

export function ListeningPlayerCard({
  episode,
  currentTime,
  duration,
  isPlaying,
  currentMomentMode,
  currentMomentLabel,
  currentMomentText,
  currentMomentMeta,
  currentMomentScrollProgress,
  onSeek,
  onSkipBack,
  onTogglePlayback,
  onSkipForward,
  onAsk,
}: Props) {
  const totalDuration = duration || episode.duration || 0;
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const trackWidthRef = useRef(0);
  const [stageTextHeight, setStageTextHeight] = useState(0);
  const stageMetaText = currentMomentMode === 'transcript'
    ? (currentMomentMeta ? `${currentMomentMeta} • ${formatTime(currentTime)}` : formatTime(currentTime))
    : currentMomentMeta;
  const stageLineHeight = currentMomentMode === 'fallback' ? 25 : 27;
  const stageViewportHeight = stageLineHeight * 5;
  const stageOverflowHeight = Math.max(0, stageTextHeight - stageViewportHeight);
  const stageTextOffset = stageOverflowHeight * Math.min(1, Math.max(0, currentMomentScrollProgress));

  useEffect(() => {
    setStageTextHeight(0);
  }, [currentMomentMode, currentMomentText]);

  const seekFromLocation = useCallback((locationX: number) => {
    if (!totalDuration || !trackWidthRef.current) return;
    const ratio = Math.min(1, Math.max(0, locationX / trackWidthRef.current));
    onSeek(ratio * totalDuration);
  }, [onSeek, totalDuration]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  const handleTrackPress = useCallback((event: GestureResponderEvent) => {
    seekFromLocation(event.nativeEvent.locationX);
  }, [seekFromLocation]);

  const handleTrackMove = useCallback((event: GestureResponderEvent) => {
    seekFromLocation(event.nativeEvent.locationX);
  }, [seekFromLocation]);

  return (
    <View style={styles.shell}>
      <EpisodeContextCard
        episode={episode}
        detail={`${episode.podcastName || 'Curio'} • ${formatTime(currentTime)}`}
      />

      <View style={styles.stage}>
        <View style={styles.stageInner}>
          <View style={styles.stageHeader}>
            <Text style={styles.stageLabel}>{currentMomentLabel}</Text>

            <View style={styles.waveRow}>
              {Array.from({ length: 9 }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.waveBar,
                    { height: 18 + ((index * 7) % 24) },
                  ]}
                />
              ))}
            </View>

            {stageMetaText ? (
              <Text style={styles.stageMeta}>{stageMetaText}</Text>
            ) : null}
          </View>

          <View style={styles.transcriptBlock}>
            <View
              style={[
                styles.stageTextViewport,
                { height: stageViewportHeight },
              ]}
            >
              <View style={{ transform: [{ translateY: -stageTextOffset }] }}>
                <Text
                  style={[styles.stageText, currentMomentMode === 'fallback' && styles.stageTextFallback]}
                  onLayout={(event: LayoutChangeEvent) => {
                    setStageTextHeight(event.nativeEvent.layout.height);
                  }}
                >
                  {currentMomentText}
                </Text>
              </View>
            </View>

          </View>

          <View style={styles.stageFooter}>
            <Pressable style={styles.askBtn} onPress={onAsk}>
              <View style={styles.askIcon}>
                <View style={styles.askDot} />
              </View>
              <Text style={styles.askText}>Ask Curio about this moment</Text>
            </Pressable>

            <Text style={styles.disclosureText}>
              {AGENT_DISCLOSURE_TEXT}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <View style={styles.progressSection}>
          <View
            style={styles.track}
            onLayout={handleTrackLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleTrackPress}
            onResponderMove={handleTrackMove}
            onResponderRelease={handleTrackPress}
          >
            <View style={styles.trackRail} />
            <View style={[styles.trackFill, { width: `${progress}%` }]} />
            <View style={[styles.trackThumb, { left: `${progress}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable onPress={onSkipBack} hitSlop={10}>
            <Text style={styles.controlLabel}>-30</Text>
          </Pressable>
          <Pressable style={styles.playBtn} onPress={onTogglePlayback}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={22}
              color="#111213"
              style={isPlaying ? undefined : { marginLeft: 2 }}
            />
          </Pressable>
          <Pressable onPress={onSkipForward} hitSlop={10}>
            <Text style={styles.controlLabel}>+30</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    paddingTop: 8,
    gap: 18,
  },
  stage: {
    flex: 1,
    minHeight: 280,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#101214',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  stageInner: {
    flex: 1,
  },
  stageHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  transcriptBlock: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  stageFooter: {
    marginTop: 20,
  },
  stageLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: 10,
    textAlign: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  waveBar: {
    width: 4,
    borderRadius: radii.full,
    backgroundColor: 'rgba(129, 195, 147, 0.5)',
  },
  stageMeta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  stageText: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  stageTextFallback: {
    fontSize: 17,
    lineHeight: 25,
    color: colors.textSecondary,
  },
  stageTextViewport: {
    overflow: 'hidden',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  disclosureText: {
    marginTop: 12,
    alignSelf: 'center',
    maxWidth: 360,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textDim,
    textAlign: 'center',
  },
  bottomSection: {
    gap: 18,
    paddingBottom: 10,
  },
  progressSection: {
    width: '100%',
  },
  track: {
    height: 18,
    borderRadius: radii.full,
    justifyContent: 'center',
    marginBottom: 8,
  },
  trackRail: {
    ...StyleSheet.absoluteFillObject,
    top: 7,
    bottom: 7,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 7,
    bottom: 7,
    borderRadius: radii.full,
    backgroundColor: 'rgba(246, 240, 231, 0.96)',
  },
  trackThumb: {
    position: 'absolute',
    top: 3,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(246, 240, 231, 0.98)',
    borderWidth: 2,
    borderColor: '#111213',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: colors.textDim,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  controlLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textDim,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(246, 240, 231, 0.96)',
  },
  askBtn: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(79, 125, 96, 0.38)',
    backgroundColor: 'rgba(17, 26, 20, 0.92)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  askIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  askText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#81c393',
  },
});
