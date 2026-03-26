import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useAudio } from '../context/AudioContext';
import { NotionSettingsSheet } from '../components/NotionSettingsSheet';
import { useDiscoverEpisodes } from '../hooks/useDiscoverEpisodes';
import { colors, radii, typography } from '../constants/theme';
import { FeaturedEpisodeRow } from '../components/FeaturedEpisodeRow';
import { HomeSearchRail } from '../components/HomeSearchRail';
import { LibrarySheet } from '../components/LibrarySheet';
import { MiniPlayer } from '../components/MiniPlayer';
import { PodcastShelfSection, type ShelfCardItem } from '../components/PodcastShelfSection';
import { getNotionSettings } from '../services/notionSettings';
import type { DiscoverTopic } from '../types';

const TOPIC_CHIPS: DiscoverTopic[] = [
  'Trending',
  'Science',
  'Technology',
  'Business',
  'History',
];

function LoadingLine({ style }: { style?: any }) {
  return <View style={[styles.loadingLine, style]} />;
}

function LoadingShelf() {
  return (
    <View style={styles.loadingSection}>
      <View style={styles.loadingSectionHeader}>
        <LoadingLine style={styles.loadingSectionTitle} />
        <LoadingLine style={styles.loadingSectionLink} />
      </View>

      <View style={styles.loadingShelfViewport}>
        <View style={styles.loadingShelfRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={styles.loadingShelfItem}>
              <View style={styles.loadingShelfCard} />
              <LoadingLine style={styles.loadingShelfTitle} />
              <LoadingLine style={styles.loadingShelfMeta} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}hr ${String(minutes % 60).padStart(2, '0')} min`;
  }
  return `${minutes} min`;
}

export function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const audio = useAudio();
  const [notionSettingsVisible, setNotionSettingsVisible] = useState(false);
  const [notionConnected, setNotionConnected] = useState(() => Boolean(getNotionSettings()));
  const {
    currentEpisode,
    loading,
    error,
    quickPickEpisodes,
    reload,
    play,
  } = useDiscoverEpisodes(state.discoverTopic);

  const hasMinimizedPlayer = state.screen === 'discover' && Boolean(state.currentEpisode);
  const footerMode = hasMinimizedPlayer && state.currentEpisode ? 'mini-player' : 'browse-rail';

  const handlePlay = () => {
    if (!currentEpisode) return;
    play();
    void audio.play(currentEpisode.enclosureUrl);
  };

  const handleTopicPress = (topic: DiscoverTopic) => {
    dispatch({ type: 'SET_DISCOVER_TOPIC', topic });
  };

  const shelfCards = useMemo<ShelfCardItem[]>(() => {
    const seen = new Set<string>();
    const featuredKey = currentEpisode
      ? ((currentEpisode.feedUrl || currentEpisode.podcastName || currentEpisode.title).toLowerCase())
      : null;
    if (featuredKey) seen.add(featuredKey);

    return state.podcasts.reduce<ShelfCardItem[]>((items, podcast) => {
      const key = (podcast.feedUrl || podcast.name).toLowerCase();
      if (seen.has(key)) return items;
      seen.add(key);

      items.push({
        id: podcast.id,
        title: podcast.name,
        meta: podcast.genre || podcast.author || 'Podcast',
        imageUrl: podcast.artworkUrl,
        onPress: () => dispatch({ type: 'OPEN_LIBRARY', podcast }),
      });

      return items;
    }, []);
  }, [currentEpisode, dispatch, state.podcasts]);

  const popularThisWeek = useMemo(() => shelfCards.slice(0, 6), [shelfCards]);

  const nonFeaturedEpisodes = useMemo(() => {
    const featuredPodcast = currentEpisode?.podcastName || currentEpisode?.title;
    return state.discoverEpisodes.filter((episode) => {
      const podcast = episode.podcastName || episode.title;
      return podcast !== featuredPodcast;
    });
  }, [currentEpisode, state.discoverEpisodes]);

  const episodeShelf = useMemo<ShelfCardItem[]>(
    () =>
      nonFeaturedEpisodes.slice(0, 5).map((episode) => ({
        id: episode.id,
        title: episode.title,
        meta: `${episode.podcastName || 'Podcast'} · ${formatDuration(episode.duration)}`,
        imageUrl: episode.imageUrl,
        onPress: () => {
          dispatch({ type: 'PLAY_EPISODE', episode });
          void audio.play(episode.enclosureUrl);
        },
      })),
    [audio, dispatch, nonFeaturedEpisodes],
  );

  const quickPicks = useMemo(() => {
    return quickPickEpisodes;
  }, [quickPickEpisodes]);

  const bottomPadding = 12;
  const podcastShelfTitle =
    state.discoverTopic === 'Trending' ? 'Trending podcasts' : 'Top podcasts';
  const episodeShelfTitle = 'Latest episodes';
  const handleNotionSettingsChange = useCallback((settings: { token: string; parentPageId: string } | null) => {
    setNotionConnected(Boolean(settings));
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>curio</Text>
          <Pressable
            style={[styles.headerIconBtn, notionConnected && styles.headerIconBtnActive]}
            onPress={() => setNotionSettingsVisible(true)}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={notionConnected ? colors.accentText : colors.textPrimary}
            />
            {notionConnected ? <View style={styles.connectedDot} /> : null}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.topicScroll}
          contentContainerStyle={styles.topicRow}
        >
          {TOPIC_CHIPS.map((topic) => (
            <Pressable
              key={topic}
              style={[styles.topicChip, state.discoverTopic === topic && styles.topicChipActive]}
              onPress={() => handleTopicPress(topic)}
            >
              <Text style={[styles.topicText, state.discoverTopic === topic && styles.topicTextActive]}>
                {topic}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.featuredWrap}>
          {loading ? (
            <>
              <View style={styles.loadingFeatureRow}>
                <View style={styles.loadingArtwork} />
                <View style={styles.loadingFeatureCopy}>
                  <LoadingLine style={styles.loadingFeatureTitle} />
                  <LoadingLine style={styles.loadingFeatureMeta} />
                  <LoadingLine style={styles.loadingFeatureBody} />
                  <LoadingLine style={styles.loadingFeatureBodyShort} />
                  <View style={styles.loadingActionRow}>
                    <View style={styles.loadingPlayButton} />
                  </View>
                </View>
              </View>

              <View style={styles.sectionDivider} />

              <LoadingShelf />
              <LoadingShelf />

              <View style={styles.loadingQuickSection}>
                <LoadingLine style={styles.loadingQuickHeader} />
                <View style={styles.quickList}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <View key={index} style={styles.loadingQuickItem}>
                      <LoadingLine style={styles.loadingQuickTitle} />
                      <LoadingLine style={styles.loadingQuickMeta} />
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : error ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{error}</Text>
              <Text style={styles.emptyBody}>Try another topic or browse podcasts.</Text>
              <Pressable style={styles.primaryBtn} onPress={() => dispatch({ type: 'OPEN_LIBRARY' })}>
                <Text style={styles.primaryText}>Open Library</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  dispatch({ type: 'SET_DISCOVER_TOPIC', topic: 'Trending' });
                  reload();
                }}
              >
                <Text style={styles.secondaryText}>Back to Trending</Text>
              </Pressable>
            </View>
          ) : currentEpisode ? (
            <>
              <FeaturedEpisodeRow
                episode={currentEpisode}
                topicLabel={state.discoverTopic}
                onPlay={handlePlay}
              />

              <View style={styles.sectionDivider} />

              <PodcastShelfSection
                title={podcastShelfTitle}
                onSeeAll={() => dispatch({ type: 'OPEN_LIBRARY' })}
                items={popularThisWeek}
              />

              <PodcastShelfSection
                title={episodeShelfTitle}
                onSeeAll={() => dispatch({ type: 'OPEN_LIBRARY' })}
                items={episodeShelf}
              />

              {quickPicks.length > 0 && (
                <View style={styles.quickSection}>
                  <Text style={styles.quickTitle}>Quick picks</Text>
                  <View style={styles.quickList}>
                    {quickPicks.map((episode) => (
                      <Pressable
                        key={episode.id}
                        style={styles.quickItem}
                        onPress={() => {
                          dispatch({ type: 'PLAY_EPISODE', episode });
                          void audio.play(episode.enclosureUrl);
                        }}
                      >
                        <Text style={styles.quickItemTitle} numberOfLines={1}>
                          {episode.title}
                        </Text>
                        <Text style={styles.quickItemMeta} numberOfLines={1}>
                          {(episode.podcastName || 'Podcast')} · {formatDuration(episode.duration)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No episodes for this topic</Text>
              <Text style={styles.emptyBody}>Try another topic or browse podcasts.</Text>
              <Pressable style={styles.primaryBtn} onPress={() => dispatch({ type: 'OPEN_LIBRARY' })}>
                <Text style={styles.primaryText}>Open Library</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => dispatch({ type: 'SET_DISCOVER_TOPIC', topic: 'Trending' })}
              >
                <Text style={styles.secondaryText}>Back to Trending</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomDock, { paddingBottom: 14 + insets.bottom }]}>
        {footerMode === 'mini-player' && state.currentEpisode ? (
          <MiniPlayer
            key="mini-player"
            episode={state.currentEpisode}
            onPress={() => dispatch({ type: 'OPEN_PLAYER' })}
          />
        ) : (
          <HomeSearchRail
            key="browse-rail"
            onPress={() => dispatch({ type: 'OPEN_LIBRARY' })}
          />
        )}
      </View>

      <LibrarySheet
        visible={state.libraryVisible}
        discoverTopic={state.discoverTopic}
        podcasts={state.podcasts}
        initialPodcast={state.libraryPodcast}
        onClose={() => dispatch({ type: 'CLOSE_LIBRARY' })}
        onPlay={(episode) => {
          dispatch({ type: 'PLAY_EPISODE', episode });
          void audio.play(episode.enclosureUrl);
        }}
      />

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
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logo: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerIconBtnActive: {
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
  },
  connectedDot: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  topicRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  topicScroll: {
    marginBottom: 18,
  },
  topicChip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
  },
  topicChipActive: {
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
  },
  topicText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  topicTextActive: {
    color: colors.accentText,
  },
  featuredWrap: {
    marginTop: 2,
  },
  loadingFeatureRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'stretch',
  },
  loadingArtwork: {
    width: '42%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
  },
  loadingFeatureCopy: {
    flex: 1.05,
    minWidth: 0,
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  loadingLine: {
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  loadingFeatureTitle: {
    width: '88%',
    height: 18,
    marginBottom: 8,
  },
  loadingFeatureMeta: {
    width: '70%',
    height: 12,
    marginBottom: 12,
  },
  loadingFeatureBody: {
    width: '96%',
    height: 12,
    marginBottom: 8,
  },
  loadingFeatureBodyShort: {
    width: '76%',
    height: 12,
  },
  loadingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  loadingPlayButton: {
    width: 92,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e7dfd4',
    opacity: 0.18,
  },
  loadingSection: {
    marginTop: 22,
  },
  loadingSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingShelfRow: {
    flexDirection: 'row',
    gap: 12,
  },
  loadingShelfViewport: {
    overflow: 'hidden',
  },
  loadingShelfItem: {
    width: 98,
  },
  loadingShelfCard: {
    width: 98,
    height: 98,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 8,
  },
  loadingSectionTitle: {
    width: 126,
    height: 14,
  },
  loadingSectionLink: {
    width: 42,
    height: 12,
  },
  loadingShelfTitle: {
    width: '92%',
    height: 12,
    marginBottom: 6,
  },
  loadingShelfMeta: {
    width: '58%',
    height: 11,
  },
  emptyCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 24,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 18,
  },
  primaryBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: colors.accentDim,
    marginBottom: 10,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentText,
  },
  secondaryBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 18,
  },
  quickSection: {
    marginTop: 22,
  },
  loadingQuickSection: {
    marginTop: 22,
  },
  loadingQuickHeader: {
    width: 104,
    height: 14,
    marginBottom: 12,
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  quickList: {
    gap: 10,
  },
  quickItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loadingQuickItem: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  loadingQuickTitle: {
    width: '84%',
    height: 12,
    marginBottom: 8,
  },
  loadingQuickMeta: {
    width: '52%',
    height: 11,
  },
  quickItemMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  bottomDock: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
});
