import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchPodcasts, fetchFeed } from '../services/api';
import { colors, radii, typography } from '../constants/theme';
import type { DiscoverTopic, Episode, Podcast } from '../types';

interface Props {
  visible: boolean;
  discoverTopic: DiscoverTopic;
  podcasts: Podcast[];
  initialPodcast: Podcast | null;
  onClose: () => void;
  onPlay: (episode: Episode) => void;
}

const TOPIC_CHIPS: DiscoverTopic[] = [
  'Trending',
  'Science',
  'Technology',
  'Business',
  'History',
];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)} min`;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function LibrarySheet({ visible, discoverTopic, podcasts, initialPodcast, onClose, onPlay }: Props) {
  const animation = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<DiscoverTopic>(discoverTopic);
  const [searchResults, setSearchResults] = useState<Podcast[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [520, 0],
  });

  const loadTopicResults = useCallback(async (topic: DiscoverTopic) => {
    if (topic === 'Trending') {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const results = await searchPodcasts(topic);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
      setSearchError('Couldn’t load podcasts for this topic.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handlePodcastPress = useCallback(async (podcast: Podcast) => {
    setSelectedPodcast(podcast);
    setEpisodesError(null);
    setLoadingEpisodes(true);
    try {
      const feedEpisodes = await fetchFeed(podcast.feedUrl);
      setEpisodes(
        feedEpisodes.slice(0, 18).map((episode: Episode) => ({
          ...episode,
          podcastName: podcast.name,
          genre: podcast.genre,
          imageUrl: episode.imageUrl || podcast.artworkUrl,
        })),
      );
    } catch {
      setEpisodes([]);
      setEpisodesError('Couldn\'t load episodes for this podcast.');
    } finally {
      setLoadingEpisodes(false);
    }
  }, []);

  const prevVisible = useRef(false);

  useEffect(() => {
    const opening = visible && !prevVisible.current;
    prevVisible.current = visible;

    if (opening) {
      setMounted(true);
      setQuery('');
      setActiveTopic(discoverTopic);
      setSearchResults([]);
      setSearchError(null);

      Animated.timing(animation, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();

      if (initialPodcast) {
        setSelectedPodcast(initialPodcast);
        setEpisodes([]);
        setEpisodesError(null);
        setLoadingEpisodes(true);
        fetchFeed(initialPodcast.feedUrl)
          .then((feedEpisodes) => {
            setEpisodes(
              feedEpisodes.slice(0, 18).map((episode: Episode) => ({
                ...episode,
                podcastName: initialPodcast.name,
                genre: initialPodcast.genre,
                imageUrl: episode.imageUrl || initialPodcast.artworkUrl,
              })),
            );
          })
          .catch(() => {
            setEpisodes([]);
            setEpisodesError('Couldn\'t load episodes for this podcast.');
          })
          .finally(() => setLoadingEpisodes(false));
      } else {
        setSelectedPodcast(null);
        setEpisodes([]);
        setEpisodesError(null);
        if (discoverTopic !== 'Trending') {
          void loadTopicResults(discoverTopic);
        }
        const focusTimer = setTimeout(() => {
          inputRef.current?.focus();
        }, 120);
        return () => clearTimeout(focusTimer);
      }

      return;
    }

    if (!visible && mounted) {
      Animated.timing(animation, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [animation, visible]);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    setSearchError(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!text.trim()) {
      if (activeTopic === 'Trending') {
        setSearchResults([]);
      } else {
        void loadTopicResults(activeTopic);
      }
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(() => {
      searchPodcasts(text)
        .then((results) => {
          setSearchResults(results);
          setSearchError(null);
        })
        .catch(() => {
          setSearchResults([]);
          setSearchError('No matches found');
        })
        .finally(() => setSearching(false));
    }, 250);
  }, [activeTopic, loadTopicResults]);

  const handleTopicPress = useCallback((topic: DiscoverTopic) => {
    setActiveTopic(topic);
    setQuery('');
    setSearchError(null);
    if (topic === 'Trending') {
      setSearchResults([]);
      return;
    }

    void loadTopicResults(topic);
  }, [loadTopicResults]);

  if (!mounted) return null;

  const displayPodcasts = query
    ? searchResults
    : activeTopic === 'Trending'
      ? podcasts
      : searchResults;

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.backdrop, { opacity: animation }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.handle} />

        {selectedPodcast ? (
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.subHeader}>
              <Pressable style={styles.roundBtn} onPress={() => setSelectedPodcast(null)}>
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </Pressable>

              {selectedPodcast.artworkUrl ? (
                <Image source={{ uri: selectedPodcast.artworkUrl }} style={styles.subHeaderArt} />
              ) : (
                <View style={[styles.subHeaderArt, styles.artFallback]} />
              )}

              <View style={styles.subHeaderCopy}>
                <Text style={styles.subHeaderTitle} numberOfLines={1}>{selectedPodcast.name}</Text>
                <Text style={styles.subHeaderMeta}>{selectedPodcast.genre}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Episodes</Text>

            {loadingEpisodes ? (
              <View style={styles.stateWrap}>
                <ActivityIndicator color={colors.accentText} />
              </View>
            ) : episodesError ? (
              <View style={styles.stateWrap}>
                <Text style={styles.stateText}>{episodesError}</Text>
              </View>
            ) : (
              episodes.map((episode) => (
                <Pressable key={episode.id} style={styles.episodeRow} onPress={() => onPlay(episode)}>
                  <View style={styles.episodeCopy}>
                    <Text style={styles.episodeDate}>{formatDate(episode.pubDate)}</Text>
                    <Text style={styles.episodeTitle} numberOfLines={2}>{episode.title}</Text>
                    <Text style={styles.episodeMeta}>{formatDuration(episode.duration)}</Text>
                  </View>
                  <View style={styles.playDot}>
                    <Ionicons name="play" size={11} color={colors.textPrimary} style={{ marginLeft: 1 }} />
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : (
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.headerRow}>
              <Text style={styles.title}>Library</Text>
              <Pressable style={styles.roundBtn} onPress={onClose}>
                <Ionicons name="close" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={15} color={colors.textTertiary} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                value={query}
                onChangeText={handleSearch}
                placeholder="Search podcasts or topics"
                placeholderTextColor={colors.textDim}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <View style={styles.chips}>
                {TOPIC_CHIPS.map((topic) => (
                  <Pressable
                    key={topic}
                    style={[styles.chip, activeTopic === topic && styles.chipActive]}
                    onPress={() => handleTopicPress(topic)}
                  >
                    <Text style={[styles.chipText, activeTopic === topic && styles.chipTextActive]}>
                      {topic}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {searching && (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.accentText} />
              </View>
            )}

            <Text style={styles.sectionLabel}>Results</Text>

            {searchError ? (
              <View style={styles.stateWrap}>
                <Text style={styles.stateText}>{searchError}</Text>
              </View>
            ) : displayPodcasts.length === 0 && !searching ? (
              <View style={styles.stateWrap}>
                <Text style={styles.stateText}>No matches found</Text>
              </View>
            ) : (
              displayPodcasts.slice(0, 12).map((podcast) => (
                <Pressable key={podcast.id} style={styles.podcastRow} onPress={() => handlePodcastPress(podcast)}>
                  {podcast.artworkUrl ? (
                    <Image source={{ uri: podcast.artworkUrl }} style={styles.podcastArt} />
                  ) : (
                    <View style={[styles.podcastArt, styles.artFallback]} />
                  )}
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{podcast.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>{podcast.genre}</Text>
                  </View>
                  <View style={styles.playDot}>
                    <Ionicons name="chevron-forward" size={12} color={colors.textPrimary} />
                  </View>
                </Pressable>
              ))
            )}

          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '78%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    backgroundColor: colors.surface,
    paddingTop: 12,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: 12,
  },
  content: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  roundBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipScroll: {
    marginTop: 12,
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
  },
  chipText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accentText,
  },
  inlineLoading: {
    paddingVertical: 10,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: 6,
    marginBottom: 8,
  },
  podcastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  podcastArt: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  artFallback: {
    backgroundColor: colors.panel,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowMeta: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  playDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateWrap: {
    paddingVertical: 18,
  },
  stateText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  subHeaderArt: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  subHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  subHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subHeaderMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  episodeCopy: {
    flex: 1,
    minWidth: 0,
  },
  episodeDate: {
    fontSize: 10,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  episodeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  episodeMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});
