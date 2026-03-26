import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AGENT_DISCLOSURE_TEXT } from '../constants/legal';
import { NotionSaveToast } from './NotionSaveToast';
import { SourceToast } from './SourceToast';
import { colors, radii, typography } from '../constants/theme';
import type { Episode, Source } from '../types';
import { EpisodeContextCard } from './EpisodeContextCard';

interface Props {
  episode: Episode;
  momentTime: number;
  status: 'connecting' | 'listening' | 'thinking' | 'searching' | 'answering' | 'error';
  isAgentSpeaking?: boolean;
  isUserSpeaking?: boolean;
  inputWaveform?: number[];
  outputWaveform?: number[];
  questionText: string | null;
  answerText: string | null;
  sources: Source[];
  isSearchingWeb?: boolean;
  hasSavableTurn?: boolean;
  notionConnected?: boolean;
  notionPageUrl?: string | null;
  notionPageTitle?: string | null;
  episodeNotionPageUrl?: string | null;
  episodeNotionPageTitle?: string | null;
  notionSaveIsNew?: boolean | null;
  notionSaving?: boolean;
  notionSaveError?: string | null;
  errorMessage?: string | null;
  onSaveToNotion: () => void;
  onOpenNotionSettings: () => void;
  onResume: () => void;
  onFollowUp: () => void;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function shorten(text: string, maxLength: number): string {
  if (!text) return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

export function InterruptOverlay({
  episode,
  momentTime,
  status,
  isAgentSpeaking,
  isUserSpeaking,
  inputWaveform = [],
  outputWaveform = [],
  questionText,
  answerText,
  sources,
  isSearchingWeb,
  hasSavableTurn,
  notionConnected,
  notionPageUrl,
  notionPageTitle,
  episodeNotionPageUrl,
  episodeNotionPageTitle,
  notionSaveIsNew,
  notionSaving,
  notionSaveError,
  errorMessage,
  onSaveToNotion,
  onOpenNotionSettings,
  onResume,
  onFollowUp,
  onClose,
}: Props) {
  const animation = useRef(new Animated.Value(0)).current;
  const liveSourcePulse = useRef(new Animated.Value(0)).current;
  const [answerTextHeight, setAnswerTextHeight] = useState(0);
  const [answerScrollProgress, setAnswerScrollProgress] = useState(0);
  const answerLineHeight = 25;
  const answerViewportHeight = answerLineHeight * 5;
  const answerOverflowHeight = Math.max(0, answerTextHeight - answerViewportHeight);
  const answerTextOffset = answerOverflowHeight * Math.min(1, Math.max(0, answerScrollProgress));

  useEffect(() => {
    Animated.timing(animation, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [animation]);

  useEffect(() => {
    if (!isSearchingWeb) {
      liveSourcePulse.stopAnimation();
      liveSourcePulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveSourcePulse, {
          toValue: 1,
          duration: 780,
          useNativeDriver: true,
        }),
        Animated.timing(liveSourcePulse, {
          toValue: 0,
          duration: 780,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [isSearchingWeb, liveSourcePulse]);

  useEffect(() => {
    setAnswerTextHeight(0);
    setAnswerScrollProgress(0);
  }, [questionText]);

  useEffect(() => {
    if (answerOverflowHeight <= 0) {
      setAnswerScrollProgress(0);
      return;
    }

    const requestFrame =
      globalThis.requestAnimationFrame?.bind(globalThis) ||
      ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16) as unknown as number);
    const cancelFrame =
      globalThis.cancelAnimationFrame?.bind(globalThis) ||
      ((id: number) => clearTimeout(id));

    const holdMs = 1200;
    const durationMs = Math.max(3200, (answerOverflowHeight / answerLineHeight) * 1800);
    let frameId = 0;
    let startedAt: number | null = null;

    const tick = (timestamp: number) => {
      if (startedAt === null) {
        startedAt = timestamp;
      }

      const elapsed = timestamp - startedAt;
      const progress = elapsed <= holdMs
        ? 0
        : Math.min(1, (elapsed - holdMs) / durationMs);

      setAnswerScrollProgress((current) => (Math.abs(current - progress) < 0.01 ? current : progress));

      if (progress < 1) {
        frameId = requestFrame(tick);
      }
    };

    frameId = requestFrame(tick);
    return () => cancelFrame(frameId);
  }, [answerLineHeight, answerOverflowHeight]);

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const isVoiceCaptureMode = status === 'connecting' || status === 'listening';
  const showInlineInputWaveform = Boolean(isUserSpeaking) && !isVoiceCaptureMode && status !== 'error';
  const momentExcerpt = useMemo(
    () => shorten(episode.description || 'Ask Curio about the exact moment you just heard.', 96),
    [episode.description]
  );
  const stageTitle =
    status === 'connecting'
      ? 'Connecting Curio…'
      : status === 'listening'
        ? 'Curio is listening…'
        : status === 'searching'
          ? 'Searching the web…'
          : status === 'thinking'
            ? 'Curio is thinking…'
            : status === 'answering'
              ? 'Curio is answering'
              : 'Curio hit a snag';
  const stageHint =
    status === 'connecting'
      ? 'Opening the voice session and syncing this moment.'
      : status === 'listening'
        ? 'Ask about this exact moment. Curio should answer when you pause.'
        : status === 'searching'
          ? 'Curio found a lead and is checking outside sources for specifics.'
          : status === 'thinking'
            ? 'Curio heard you. It is pulling the transcript and shaping a reply.'
            : status === 'answering'
              ? 'Curio is responding now.'
              : (errorMessage || 'Curio couldn’t answer right now. Resume playback or try again.');
  const answerFallback =
    status === 'searching'
      ? 'Curio is checking the web for specifics.'
      : status === 'thinking'
        ? 'Curio heard you and is pulling together the answer.'
        : status === 'answering'
          ? 'Curio is responding now.'
          : 'Curio is pulling together a short answer.';
  const showQuestionBlock = Boolean(questionText) || status !== 'error';
  const showAnswerSubtext =
    status !== 'error' &&
    (status === 'thinking' || status === 'searching');
  const hasSources = sources.length > 0;
  const showLiveEvidenceStrip = status !== 'error' && Boolean(isSearchingWeb);
  const showNotionConnect = status !== 'error' && !notionConnected;
  const showNotionSaveAction = status !== 'error' && Boolean(notionConnected && hasSavableTurn);
  const notionActionDisabled = Boolean(notionSaving || notionPageUrl);
  const notionActionLabel = notionSaving
    ? 'Saving...'
    : notionPageUrl
      ? 'Saved'
      : 'Save to Notion';
  const notionActionIcon = notionPageUrl
    ? 'checkmark-circle'
    : notionSaving
      ? 'time-outline'
      : 'bookmark-outline';
  const liveSourceDotOpacity = liveSourcePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.52, 1],
  });
  const liveSourceDotScale = liveSourcePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  return (
    <Animated.View style={[styles.container, { opacity: animation, transform: [{ translateY }] }]}>
      <EpisodeContextCard
        episode={episode}
        detail={`${episode.podcastName || 'Curio'} • paused at ${formatTime(momentTime)}`}
      />

      {isVoiceCaptureMode ? (
        <View style={styles.speakingStage}>
          {status === 'connecting' ? (
            <View style={styles.connectingOrb}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : (
            <View style={styles.waveform}>
              {inputWaveform.map((value, index) => (
                <View
                  key={index}
                  style={[styles.waveBar, { transform: [{ scaleY: value || 0.12 }] }]}
                />
              ))}
            </View>
          )}
          <Text style={styles.listeningTitle}>{stageTitle}</Text>
          <Text style={styles.listeningHint}>{stageHint}</Text>

          <Pressable style={styles.micBtn} onPress={onClose}>
            <Ionicons name="play" size={16} color="#08110b" style={{ marginLeft: 2 }} />
          </Pressable>
          <Text style={styles.stopHint}>Tap to resume playback</Text>
        </View>
      ) : (
        <>
          <View style={styles.conversationStage}>
            <ScrollView
              style={styles.conversationScroll}
              contentContainerStyle={styles.conversationContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.inlineContext}>
                <Text style={styles.inlineMomentLabel}>At {formatTime(momentTime)}</Text>
                <Text style={styles.inlineMomentText}>“{momentExcerpt}”</Text>
                <Text style={styles.inlineDisclosure}>{AGENT_DISCLOSURE_TEXT}</Text>
              </View>

              {showQuestionBlock ? (
                <View style={[styles.messageBlock, styles.questionBlock]}>
                  <View style={styles.roleRow}>
                    <View style={styles.youDot} />
                    <Text style={styles.roleText}>You</Text>
                  </View>
                  <Text style={styles.questionText}>
                    {questionText || 'What just happened here?'}
                  </Text>
                  {showInlineInputWaveform ? (
                    <View style={styles.userWaveform}>
                      {inputWaveform.map((value, index) => (
                        <View
                          key={`user-${index}`}
                          style={[styles.userWaveBar, { transform: [{ scaleY: value || 0.12 }] }]}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.messageBlock, styles.answerBlock]}>
                <View style={styles.roleRow}>
                  <View style={styles.curioDot} />
                  <Text style={[styles.roleText, styles.curioRoleText]}>Curio</Text>
                </View>
                <View style={[styles.answerViewport, { height: answerViewportHeight }]}>
                  <View style={{ transform: [{ translateY: -answerTextOffset }] }}>
                    <Text
                      style={styles.answerText}
                      onLayout={(event: LayoutChangeEvent) => {
                        setAnswerTextHeight(event.nativeEvent.layout.height);
                      }}
                    >
                      {status === 'error'
                        ? (errorMessage || 'Curio couldn’t answer right now. Resume playback or try again.')
                        : (answerText || answerFallback)}
                    </Text>
                  </View>
                </View>
                {showLiveEvidenceStrip ? (
                  <View style={styles.evidenceRow}>
                    <Animated.View
                      style={[
                        styles.integrationDot,
                        {
                          opacity: isSearchingWeb ? liveSourceDotOpacity : 0.92,
                          transform: [{ scale: isSearchingWeb ? liveSourceDotScale : 1 }],
                        },
                      ]}
                    />
                    <Text style={styles.evidenceText}>
                      Checking live sources
                    </Text>
                  </View>
                ) : null}
                {showAnswerSubtext && stageHint ? (
                  <Text style={styles.answerSubtext}>{stageHint}</Text>
                ) : null}
                {status !== 'error' && isAgentSpeaking ? (
                  <View style={styles.replyWaveform}>
                    {outputWaveform.map((value, index) => (
                      <View
                        key={`reply-${index}`}
                        style={[styles.replyWaveBar, { transform: [{ scaleY: value || 0.12 }] }]}
                      />
                    ))}
                  </View>
                ) : null}
                {status !== 'error' && hasSources && <SourceToast sources={sources} />}
                <NotionSaveToast
                  notionPageUrl={notionPageUrl}
                  notionPageTitle={notionPageTitle}
                  episodePageUrl={episodeNotionPageUrl}
                  episodePageTitle={episodeNotionPageTitle}
                  notionSaveIsNew={notionSaveIsNew}
                  notionSaving={notionSaving}
                  notionSaveError={notionSaveError}
                />
              </View>
            </ScrollView>
          </View>

          <View style={styles.footer}>
            {status === 'error' ? (
              <View style={styles.errorActions}>
                <Pressable style={styles.secondaryBtn} onPress={onResume}>
                  <Text style={styles.secondaryText}>Resume</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={onFollowUp}>
                  <Text style={styles.primaryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.footerActions}>
                <Pressable style={[styles.resumeBtn, styles.footerWideBtn]} onPress={onResume}>
                  <Ionicons name="play" size={12} color="#111213" />
                  <Text style={styles.resumeText}>Resume listening</Text>
                </Pressable>

                {showNotionConnect ? (
                  <Pressable
                    style={[styles.secondaryBtn, styles.notionBtn]}
                    onPress={onOpenNotionSettings}
                  >
                    <Ionicons name="settings-outline" size={14} color={colors.textPrimary} />
                    <Text numberOfLines={1} style={styles.secondaryText}>Connect Notion</Text>
                  </Pressable>
                ) : null}

                {showNotionSaveAction ? (
                  <Pressable
                    style={[
                      styles.secondaryBtn,
                      styles.notionBtn,
                      notionPageUrl && styles.notionBtnSaved,
                      notionActionDisabled && !notionPageUrl && styles.notionBtnDisabled,
                    ]}
                    onPress={onSaveToNotion}
                    disabled={notionActionDisabled}
                  >
                    {notionSaving ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <Ionicons
                        name={notionActionIcon}
                        size={14}
                        color={notionPageUrl ? colors.accentText : colors.textPrimary}
                      />
                    )}
                    <Text
                      numberOfLines={1}
                      style={[styles.secondaryText, notionPageUrl && styles.notionBtnSavedText]}
                    >
                      {notionActionLabel}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    gap: 14,
  },
  speakingStage: {
    flex: 1,
    minHeight: 0,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#101214',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  conversationStage: {
    flex: 1,
    minHeight: 0,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#101214',
    overflow: 'hidden',
  },
  conversationScroll: {
    flex: 1,
    minHeight: 0,
  },
  waveform: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  connectingOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151718',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  waveBar: {
    width: 5,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  listeningTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  listeningHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  micBtn: {
    marginTop: 28,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#88d39b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textDim,
  },
  conversationContent: {
    flexGrow: 1,
    padding: 18,
    paddingBottom: 18,
  },
  inlineContext: {
    marginBottom: 16,
  },
  inlineMomentLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  inlineMomentText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  inlineDisclosure: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textDim,
  },
  messageBlock: {
    marginBottom: 14,
  },
  questionBlock: {
    marginBottom: 18,
  },
  answerBlock: {
    marginBottom: 0,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  youDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textDim,
  },
  curioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  curioRoleText: {
    color: colors.accentText,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  answerText: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  answerViewport: {
    overflow: 'hidden',
  },
  answerSubtext: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textDim,
  },
  evidenceRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  integrationDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  evidenceText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: colors.accentText,
    letterSpacing: 0.2,
  },
  userWaveform: {
    marginTop: 10,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  userWaveBar: {
    width: 4,
    height: 18,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  replyWaveform: {
    marginTop: 10,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  replyWaveBar: {
    width: 4,
    height: 18,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  footer: {
    gap: 12,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  footerWideBtn: {
    flex: 1,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121415',
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notionBtn: {
    flex: 0,
    minWidth: 150,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  notionBtnDisabled: {
    opacity: 0.72,
  },
  notionBtnSaved: {
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
  },
  notionBtnSavedText: {
    color: colors.accentText,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#81c393',
  },
  primaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111213',
  },
  resumeBtn: {
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(246, 240, 231, 0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resumeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111213',
  },
});
