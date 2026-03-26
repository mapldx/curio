import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchFeed, fetchTrending, searchPodcasts } from '../services/api';
import type { DiscoverTopic, Episode, Podcast } from '../types';

const MAX_PODCASTS = 5;
const MAX_EPISODE_PODCASTS = 7;
const MAX_SOURCE_PODCASTS = 18;
const MAX_EPISODES_PER_PODCAST = 1;
const MAX_QUICK_PICK_EPISODES_PER_PODCAST = 1;
const FEED_FETCH_TIMEOUT_MS = 3500;

function enrichEpisodes(podcast: Podcast, episodes: Episode[]): Episode[] {
  return episodes.slice(0, MAX_EPISODES_PER_PODCAST).map((episode) => ({
    ...episode,
    podcastName: podcast.name,
    genre: podcast.genre,
    imageUrl: episode.imageUrl || podcast.artworkUrl,
  }));
}

function enrichQuickPickEpisodes(podcast: Podcast, episodes: Episode[]): Episode[] {
  return episodes.slice(0, MAX_QUICK_PICK_EPISODES_PER_PODCAST).map((episode) => ({
    ...episode,
    podcastName: podcast.name,
    genre: podcast.genre,
    imageUrl: episode.imageUrl || podcast.artworkUrl,
  }));
}

function podcastIdentity(podcast: Podcast): string {
  return (podcast.feedUrl || podcast.id || podcast.name).trim().toLowerCase();
}

function dedupePodcasts(podcasts: Podcast[]): Podcast[] {
  const seen = new Set<string>();
  return podcasts.filter((podcast) => {
    const key = podcastIdentity(podcast);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFeedWithTimeout(feedUrl: string): Promise<Episode[]> {
  return Promise.race([
    fetchFeed(feedUrl),
    new Promise<Episode[]>((resolve) => {
      setTimeout(() => resolve([]), FEED_FETCH_TIMEOUT_MS);
    }),
  ]);
}

function isNewsLikePodcast(podcast: Podcast): boolean {
  return /\b(news|politics)\b/i.test(podcast.genre);
}

export function useDiscoverEpisodes(topic: DiscoverTopic) {
  const { state, dispatch } = useApp();
  const [quickPickEpisodes, setQuickPickEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setQuickPickEpisodes([]);

      try {
        const sourcePodcasts: Podcast[] =
          topic === 'Trending' ? await fetchTrending() : await searchPodcasts(topic);
        const eligiblePodcasts = dedupePodcasts(sourcePodcasts)
          .filter((podcast) => (topic === 'Trending' ? !isNewsLikePodcast(podcast) : true))
          .filter((podcast) => Boolean(podcast.feedUrl))
          .slice(0, MAX_SOURCE_PODCASTS);
        const discoverPodcasts = eligiblePodcasts.slice(0, MAX_PODCASTS);
        const episodePodcasts = eligiblePodcasts.slice(
          MAX_PODCASTS,
          MAX_PODCASTS + MAX_EPISODE_PODCASTS,
        );
        const quickPickPodcasts = eligiblePodcasts.slice(MAX_PODCASTS + MAX_EPISODE_PODCASTS);

        if (!cancelled) {
          dispatch({ type: 'SET_PODCASTS', podcasts: discoverPodcasts });
        }

        const [episodeGroups, quickPickGroups] = await Promise.all([
          Promise.all(
            episodePodcasts.map(async (podcast) => {
              try {
                const episodes = await fetchFeedWithTimeout(podcast.feedUrl);
                return enrichEpisodes(podcast, episodes);
              } catch {
                return [];
              }
            }),
          ),
          Promise.all(
            quickPickPodcasts.map(async (podcast) => {
              try {
                const episodes = await fetchFeedWithTimeout(podcast.feedUrl);
                return enrichQuickPickEpisodes(podcast, episodes);
              } catch {
                return [];
              }
            }),
          ),
        ]);

        if (cancelled) return;

        const allEpisodes = episodeGroups
          .flat()
          .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        const quickPickEpisodes = quickPickGroups
          .flat()
          .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
          .slice(0, 4);

        dispatch({ type: 'SET_DISCOVER_EPISODES', episodes: allEpisodes });
        setQuickPickEpisodes(quickPickEpisodes);
      } catch (err) {
        if (cancelled) return;
        dispatch({ type: 'SET_DISCOVER_EPISODES', episodes: [] });
        setQuickPickEpisodes([]);
        setError(
          topic === 'Trending'
            ? 'Couldn’t load trending episodes right now.'
            : `Couldn’t load episodes for ${topic.toLowerCase()}.`,
        );
        console.error('Failed to load discover episodes:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [dispatch, reloadCount, topic]);

  const currentEpisode = state.discoverEpisodes[0] || null;

  const play = useCallback(() => {
    if (currentEpisode) {
      dispatch({ type: 'PLAY_EPISODE', episode: currentEpisode });
    }
  }, [currentEpisode, dispatch]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return {
    currentEpisode,
    totalEpisodes: state.discoverEpisodes.length,
    loading,
    error,
    quickPickEpisodes,
    reload,
    play,
  };
}
