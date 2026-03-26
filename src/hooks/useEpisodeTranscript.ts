import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchTranscript } from '../services/api';
import type { TranscriptState } from '../types';

const BACKGROUND_TRANSCRIPT_POLL_INTERVAL_MS = 3000;

function buildTranscriptState(
  episodeId: string,
  next: { status: 'pending' | 'ready' | 'failed'; segments?: TranscriptState['segments']; error?: string | null },
): TranscriptState {
  return {
    status: next.status,
    episodeId,
    segments: next.segments,
    error: next.error || null,
    updatedAt: Date.now(),
  };
}

export function useEpisodeTranscript() {
  const { state, dispatch } = useApp();
  const episode = state.currentEpisode;
  const transcript = state.transcript?.episodeId === episode?.id ? state.transcript : null;
  const hasTranscriptSource = Boolean(episode?.transcriptUrl || episode?.enclosureUrl);

  useEffect(() => {
    if (!episode || !hasTranscriptSource) return;
    if (transcript) return;

    let cancelled = false;

    dispatch({
      type: 'SET_CONTEXT',
      episodeId: episode.id,
      transcript: buildTranscriptState(episode.id, { status: 'pending' }),
    });

    void fetchTranscript({
      ...(episode.transcriptUrl ? {} : { audioUrl: episode.enclosureUrl }),
      episodeId: episode.id,
      transcriptUrl: episode.transcriptUrl,
      feedUrl: episode.feedUrl,
    })
      .then((response) => {
        if (cancelled) return;

        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: response.status,
            segments: response.segments,
            error: response.error || null,
          }),
        });
      })
      .catch((error) => {
        if (cancelled) return;

        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to fetch transcript',
          }),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, episode, hasTranscriptSource, transcript]);

  useEffect(() => {
    if (!episode) return;
    if (!hasTranscriptSource) return;
    if (state.screen !== 'listening') return;
    if (!transcript || transcript.status !== 'pending') return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetchTranscript({
          episodeId: episode.id,
          transcriptUrl: episode.transcriptUrl,
          feedUrl: episode.feedUrl,
          ...(episode.transcriptUrl ? {} : { audioUrl: episode.enclosureUrl }),
        });

        if (cancelled) return;

        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: response.status,
            segments: response.segments,
            error: response.error || null,
          }),
        });

        if (response.status === 'pending') {
          timeoutId = setTimeout(poll, BACKGROUND_TRANSCRIPT_POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled) return;

        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to fetch transcript',
          }),
        });
      }
    };

    timeoutId = setTimeout(poll, BACKGROUND_TRANSCRIPT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [dispatch, episode, hasTranscriptSource, state.screen, transcript]);
}
