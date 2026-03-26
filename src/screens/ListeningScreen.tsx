import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useAudio } from '../context/AudioContext';
import { NotionSettingsSheet } from '../components/NotionSettingsSheet';
import { useConversationSession } from '../hooks/useConversationSession';
import { useEpisodeTranscript } from '../hooks/useEpisodeTranscript';
import { colors, typography } from '../constants/theme';
import { InterruptOverlay } from '../components/InterruptOverlay';
import { ListeningPlayerCard } from '../components/ListeningPlayerCard';
import { deriveCurrentMoment } from '../services/currentMoment';
import { getNotionSettings } from '../services/notionSettings';

export function ListeningScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const audio = useAudio();
  const [notionSettingsVisible, setNotionSettingsVisible] = useState(false);
  const [notionConnected, setNotionConnected] = useState(() => Boolean(getNotionSettings()));
  const [notionSettingsVersion, setNotionSettingsVersion] = useState(0);
  useEpisodeTranscript();
  const {
    status,
    questionText,
    answerText,
    sources,
    hasSavableTurn,
    isAgentSpeaking,
    isUserSpeaking,
    isSearchingWeb,
    notionPageUrl,
    notionPageTitle,
    episodeNotionPageUrl,
    episodeNotionPageTitle,
    notionSaveIsNew,
    notionSaving,
    notionSaveError,
    inputWaveform,
    outputWaveform,
    errorMessage,
    interruptTime,
    startInterrupt,
    continueConversation,
    saveToNotionManual,
    resumePodcast,
    endSession,
  } = useConversationSession(notionSettingsVersion);

  const handleNotionSettingsChange = useCallback((settings: { token: string; parentPageId: string } | null) => {
    setNotionConnected(Boolean(settings));
    setNotionSettingsVersion((current) => current + 1);
  }, []);

  const episode = state.currentEpisode;
  const isInterrupted = state.screen === 'interrupted';
  const currentMoment = episode
    ? deriveCurrentMoment(
      episode,
      state.transcript?.episodeId === episode.id ? state.transcript.segments : undefined,
      Math.floor(audio.currentTime * 1000),
    )
    : null;

  if (!episode) return null;
  if (!currentMoment) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => dispatch({ type: 'MINIMIZE_PLAYER' })}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.nowPlaying}>Now Playing</Text>
        <Pressable
          onPress={endSession}
          style={styles.iconBtn}
        >
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      {isInterrupted ? (
        <View
          style={[
            styles.interruptedContent,
            { paddingHorizontal: 18, paddingTop: 8, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <InterruptOverlay
            episode={episode}
            momentTime={interruptTime || audio.currentTime}
            status={status}
            isAgentSpeaking={isAgentSpeaking}
            isUserSpeaking={isUserSpeaking}
            inputWaveform={inputWaveform}
            outputWaveform={outputWaveform}
            questionText={questionText}
            answerText={answerText}
            sources={sources}
            isSearchingWeb={isSearchingWeb}
            hasSavableTurn={hasSavableTurn}
            notionConnected={notionConnected}
            notionPageUrl={notionPageUrl}
            notionPageTitle={notionPageTitle}
            episodeNotionPageUrl={episodeNotionPageUrl}
            episodeNotionPageTitle={episodeNotionPageTitle}
            notionSaveIsNew={notionSaveIsNew}
            notionSaving={notionSaving}
            notionSaveError={notionSaveError}
            errorMessage={errorMessage}
            onSaveToNotion={saveToNotionManual}
            onOpenNotionSettings={() => setNotionSettingsVisible(true)}
            onResume={resumePodcast}
            onFollowUp={continueConversation}
            onClose={resumePodcast}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentInner, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <ListeningPlayerCard
            episode={episode}
            currentTime={audio.currentTime}
            duration={audio.duration}
            isPlaying={audio.isPlaying}
            currentMomentMode={currentMoment.mode}
            currentMomentLabel={currentMoment.label}
            currentMomentText={currentMoment.text}
            currentMomentMeta={currentMoment.meta}
            currentMomentScrollProgress={currentMoment.scrollProgress}
            onSeek={audio.seek}
            onSkipBack={() => audio.skip(-30)}
            onTogglePlayback={() => {
              if (audio.isPlaying) {
                audio.pause();
                return;
              }
              void audio.resume();
            }}
            onSkipForward={() => audio.skip(30)}
            onAsk={startInterrupt}
          />
          {audio.error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Playback needs another try</Text>
              <Text style={styles.errorBody}>{audio.error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => {
                  audio.clearError();
                  void audio.play(episode.enclosureUrl);
                }}
              >
                <Text style={styles.retryText}>Retry playback</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      <NotionSettingsSheet
        visible={notionSettingsVisible}
        onClose={() => setNotionSettingsVisible(false)}
        onSettingsChange={handleNotionSettingsChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 6,
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlaying: {
    ...typography.label,
    color: colors.textTertiary,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentInner: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  interruptedContent: {
    flex: 1,
    minHeight: 0,
  },
  errorCard: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: colors.accentDim,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentText,
  },
});
