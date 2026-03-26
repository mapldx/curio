import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { useApp } from '../context/AppContext';
import { useAudio } from '../context/AudioContext';
import { buildSystemPrompt, formatContextDump, formatPlaybackPosition } from '../services/agent';
import { fetchTranscript, firecrawlSearch, getContext, getNotionStatus, getSignedUrl, saveToNotion } from '../services/api';
import { getNotionSettings } from '../services/notionSettings';
import type {
  EpisodeContextBundle,
  FirecrawlSearchParams,
  FirecrawlSearchResponse,
  Source,
  TranscriptState,
} from '../types';

const AGENT_ID = process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID || '';
const TRANSCRIPT_POLL_INTERVAL_MS = 1500;
const TRANSCRIPT_MAX_WAIT_MS = 8000;
const WAVEFORM_BAR_COUNT = 7;
const INPUT_WAVE_GAIN = 2.25;
const OUTPUT_WAVE_GAIN = 1.85;
const USER_SPEAKING_ON_THRESHOLD = 0.16;
const USER_SPEAKING_OFF_THRESHOLD = 0.08;

function getCurrentDateContext(reference = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);
  const year = parts.find((part) => part.type === 'year')?.value || String(reference.getUTCFullYear());
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';

  return {
    timeZone,
    isoDate: `${year}-${month}-${day}`,
    humanDate: new Intl.DateTimeFormat('en-US', {
      timeZone,
      dateStyle: 'long',
    }).format(reference),
    year,
  };
}

type ConversationUiState =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'answering'
  | 'error';

type TurnPhase =
  | 'waiting'
  | 'tool_searching'
  | 'streaming'
  | 'complete'
  | 'failed';

type SearchStrategy = 'none' | 'tool';

interface TurnState {
  id: number;
  phase: TurnPhase;
  question: string;
  answer: string;
  responseEventId: number | null;
  committed: boolean;
  sources: Source[];
  searchStrategy: SearchStrategy;
  notionSaving: boolean;
  notionPageUrl: string | null;
  notionPageTitle: string | null;
  notionSaveIsNew: boolean | null;
  notionSaveError: string | null;
}

type SessionPhase = 'disconnected' | 'connecting' | 'listening' | 'error';

interface SessionState {
  session: SessionPhase;
  turn: TurnState | null;
}

type SessionAction =
  | { type: 'SESSION_CONNECTING' }
  | { type: 'SESSION_READY' }
  | { type: 'SESSION_DISCONNECTED' }
  | { type: 'START_TURN'; id: number; question: string }
  | { type: 'TRANSITION'; phase: TurnPhase }
  | { type: 'APPEND_ANSWER'; text: string; eventId?: number | null }
  | { type: 'REPLACE_ANSWER'; text: string; eventId?: number | null }
  | { type: 'COMMIT' }
  | { type: 'SET_SOURCES'; sources: Source[] }
  | { type: 'SET_SEARCH_STRATEGY'; strategy: SearchStrategy }
  | { type: 'NOTION_SAVE_START' }
  | { type: 'NOTION_SAVED'; pageUrl: string; pageTitle: string; isNew: boolean }
  | { type: 'NOTION_SAVE_ERROR'; message: string }
  | { type: 'FAIL' }
  | { type: 'RESET' };

const INITIAL_SESSION: SessionState = { session: 'disconnected', turn: null };

function sanitizeAgentAnswerText(text: string) {
  return text
    .replace(/(^|[\s\n])\[(?:[a-z]+(?:[ -][a-z]+){0,2})\](?=(?:[\s\n]|$))/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trimStart();
}

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SESSION_CONNECTING':
      return { session: 'connecting', turn: null };
    case 'SESSION_READY':
      return { ...state, session: 'listening' };
    case 'SESSION_DISCONNECTED':
      return { session: 'disconnected', turn: null };
    case 'FAIL':
      return {
        ...state,
        session: 'error',
        turn: state.turn ? { ...state.turn, phase: 'failed' } : null,
      };
    case 'RESET':
      return { ...state, turn: null };
    case 'START_TURN':
      return {
        ...state,
        turn: {
          id: action.id,
          phase: 'waiting',
          question: action.question,
          answer: '',
          responseEventId: null,
          committed: false,
          sources: [],
          searchStrategy: 'none',
          notionSaving: false,
          notionPageUrl: null,
          notionPageTitle: null,
          notionSaveIsNew: null,
          notionSaveError: null,
        },
      };
    default:
      break;
  }

  if (!state.turn) return state;
  const turn = state.turn;

  switch (action.type) {
    case 'TRANSITION':
      return { ...state, turn: { ...turn, phase: action.phase } };
    case 'APPEND_ANSWER':
      {
        const nextAnswer = sanitizeAgentAnswerText(turn.answer + action.text);
        return {
          ...state,
          turn: {
            ...turn,
            answer: nextAnswer,
            responseEventId: action.eventId === undefined ? turn.responseEventId : action.eventId,
          },
        };
      }
    case 'REPLACE_ANSWER': {
      const nextAnswer = sanitizeAgentAnswerText(action.text);
      const nextResponseEventId = action.eventId === undefined ? turn.responseEventId : action.eventId;
      const nextSources = turn.committed && turn.searchStrategy === 'none'
        ? extractSources(nextAnswer)
        : turn.sources;
      return {
        ...state,
        turn: {
          ...turn,
          answer: nextAnswer,
          responseEventId: nextResponseEventId,
          sources: nextSources,
        },
      };
    }
    case 'COMMIT': {
      let finalSources = turn.sources;
      if (turn.searchStrategy === 'none' && turn.sources.length === 0) {
        finalSources = extractSources(turn.answer);
      }
      return { ...state, turn: { ...turn, committed: true, sources: finalSources, phase: 'complete' } };
    }
    case 'SET_SOURCES':
      return { ...state, turn: { ...turn, sources: action.sources } };
    case 'SET_SEARCH_STRATEGY':
      return { ...state, turn: { ...turn, searchStrategy: action.strategy } };
    case 'NOTION_SAVE_START':
      return {
        ...state,
        turn: {
          ...turn,
          notionSaving: true,
          notionSaveError: null,
        },
      };
    case 'NOTION_SAVED':
      return {
        ...state,
        turn: {
          ...turn,
          notionSaving: false,
          notionPageUrl: action.pageUrl,
          notionPageTitle: action.pageTitle,
          notionSaveIsNew: action.isNew,
          notionSaveError: null,
        },
      };
    case 'NOTION_SAVE_ERROR':
      return {
        ...state,
        turn: {
          ...turn,
          notionSaving: false,
          notionSaveError: action.message,
        },
      };
    default:
      return state;
  }
}

function deriveUiStatus(s: SessionState): ConversationUiState {
  if (!s.turn) {
    if (s.session === 'connecting') return 'connecting';
    if (s.session === 'error') return 'error';
    return 'listening';
  }
  switch (s.turn.phase) {
    case 'waiting': return 'thinking';
    case 'tool_searching': return 'searching';
    case 'streaming': return 'answering';
    case 'complete': return 'answering';
    case 'failed': return 'error';
  }
}

function createFlatWaveform(value = 0.12) {
  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => value + (index % 2 === 0 ? 0.04 : 0));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function waveformEquals(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => Math.abs(value - right[index]) < 0.02);
}

function smoothWaveform(current: number[], next: number[]) {
  return next.map((value, index) => {
    const previous = current[index] ?? 0.12;
    const easing = value > previous ? 0.68 : 0.26;
    return previous + (value - previous) * easing;
  });
}

function sampleFrequencyBars(data: Uint8Array | undefined, fallbackLevel = 0, gain = 1.8) {
  if (!data || data.length === 0) {
    const base = clamp(0.18 + fallbackLevel * 0.8, 0.18, 0.82);
    return createFlatWaveform(base);
  }

  const bars = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
    const start = Math.floor((index / WAVEFORM_BAR_COUNT) * data.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / WAVEFORM_BAR_COUNT) * data.length));
    let total = 0;

    for (let position = start; position < end; position += 1) {
      total += data[position];
    }

    const average = total / Math.max(1, end - start);
    const normalized = average / 255;
    const boosted = Math.pow(normalized, 0.52) * gain + fallbackLevel * 0.45;
    return clamp(boosted, 0.18, 1.28);
  });

  const peak = Math.max(...bars);
  if (peak < 0.18 && fallbackLevel > 0) {
    return createFlatWaveform(clamp(0.22 + fallbackLevel * 0.9, 0.22, 0.82));
  }

  return bars;
}

function extractSources(text: string): Source[] {
  const urlPattern = /\bhttps?:\/\/[^\s)]+/g;
  const urls = text.match(urlPattern) || [];

  return urls.map((url) => ({
    url,
    title: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
  }));
}

function sourcesFromResults(results: FirecrawlSearchResponse['results']): Source[] {
  return results
    .slice(0, 3)
    .map((result) => ({
      url: result.url,
      title: result.title || result.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
      date: result.date,
      imageUrl: result.imageUrl,
    }));
}

function truncate(value: string | undefined, maxLength: number) {
  if (!value) return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function formatSearchToolResult(
  params: FirecrawlSearchParams,
  response: FirecrawlSearchResponse,
) {
  const header = [
    `search_web query: ${params.query}`,
    `result_count: ${response.results.length}`,
    response.warning ? `warning: ${response.warning}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (response.results.length === 0) {
    return [
      header,
      'No search results were returned.',
      'If the user still needs an answer, try a better query yourself before saying nothing was found.',
    ].join('\n\n');
  }

  const items = response.results
    .slice(0, 3)
    .map((result, index) => {
      const snippet = truncate(result.content, 320) || 'No snippet was returned.';
      return [
        `${index + 1}. ${result.title || result.url}`,
        `URL: ${result.url}`,
        result.date ? `Date: ${result.date}` : null,
        `Snippet: ${snippet}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    header,
    'Search results were found. Do not say "no results" or "I could not find anything" unless result_count is 0.',
    'Do not claim the search timed out, failed, or returned nothing if result_count is greater than 0.',
    'If these results are relevant but not conclusive, say that explicitly and run another search yourself if needed.',
    items,
  ].join('\n\n');
}

function formatNotionToolResult(pageUrl: string, pageTitle: string, isNew: boolean) {
  return isNew
    ? `Saved to Notion in "${pageTitle}". A new episode page was created: ${pageUrl}`
    : `Saved to Notion in "${pageTitle}". The current episode page was updated: ${pageUrl}`;
}

function looksLikeSaveActionQuery(query: string) {
  const normalized = query.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const hasSaveVerb =
    /\b(save|saved|saving|bookmark|bookmarked|store|stored|stash|remember|add)\b/.test(normalized);
  const hasTarget =
    /\b(notion|this|that|it|answer|response|moment|note|notes)\b/.test(normalized);

  return hasSaveVerb && hasTarget;
}

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

export function useConversationSession(notionSettingsVersion = 0) {
  const { state, dispatch } = useApp();
  const audio = useAudio();

  const [machine, dispatchM] = useReducer(sessionReducer, INITIAL_SESSION);
  const [episodeNotionPage, setEpisodeNotionPage] = useState<{ pageUrl: string | null; pageTitle: string | null }>({
    pageUrl: null,
    pageTitle: null,
  });
  const machineRef = useRef<SessionState>(INITIAL_SESSION);
  const lastCompletedTurnRef = useRef<TurnState | null>(null);
  const notionControlTurnIdsRef = useRef<Set<number>>(new Set());
  const notionStatusRequestIdRef = useRef(0);
  const lastEpisodeIdRef = useRef<string | null>(state.currentEpisode?.id || null);
  const turnCounterRef = useRef(0);
  const currentEpisodeRef = useRef(state.currentEpisode);
  const interruptTimeRef = useRef(0);

  useEffect(() => {
    machineRef.current = machine;
    if (
      machine.turn?.committed &&
      machine.turn.answer.trim() &&
      !notionControlTurnIdsRef.current.has(machine.turn.id)
    ) {
      lastCompletedTurnRef.current = machine.turn;
    }
  }, [machine]);

  useEffect(() => {
    currentEpisodeRef.current = state.currentEpisode;
    const nextEpisodeId = state.currentEpisode?.id || null;
    if (lastEpisodeIdRef.current !== nextEpisodeId) {
      lastCompletedTurnRef.current = null;
      notionControlTurnIdsRef.current.clear();
      lastEpisodeIdRef.current = nextEpisodeId;
    }
  }, [state.currentEpisode]);

  const refreshEpisodeNotionPage = useCallback(async (episode = currentEpisodeRef.current) => {
    const settings = getNotionSettings();
    const requestId = ++notionStatusRequestIdRef.current;

    if (!episode || !settings) {
      if (requestId === notionStatusRequestIdRef.current) {
        setEpisodeNotionPage({ pageUrl: null, pageTitle: null });
      }
      return;
    }

    try {
      const status = await getNotionStatus({
        notionToken: settings.token,
        parentPageId: settings.parentPageId,
        episodeId: episode.id,
        feedUrl: episode.feedUrl,
        episodeTitle: episode.title,
      });

      if (notionStatusRequestIdRef.current !== requestId) return;
      if (currentEpisodeRef.current?.id !== episode.id) return;

      setEpisodeNotionPage(
        status.exists
          ? {
            pageUrl: status.pageUrl,
            pageTitle: status.pageTitle || episode.title,
          }
          : { pageUrl: null, pageTitle: null },
      );
    } catch (error) {
      if (notionStatusRequestIdRef.current !== requestId) return;
      if (currentEpisodeRef.current?.id !== episode.id) return;
      console.warn('Failed to fetch Notion status:', error);
      setEpisodeNotionPage({ pageUrl: null, pageTitle: null });
    }
  }, []);

  useEffect(() => {
    void refreshEpisodeNotionPage(state.currentEpisode);
  }, [
    notionSettingsVersion,
    refreshEpisodeNotionPage,
    state.currentEpisode?.id,
    state.currentEpisode?.feedUrl,
    state.currentEpisode?.title,
  ]);

  const [interruptTime, setInterruptTime] = useState(0);
  const [inputWaveform, setInputWaveform] = useState<number[]>(() => createFlatWaveform());
  const [outputWaveform, setOutputWaveform] = useState<number[]>(() => createFlatWaveform());
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  useEffect(() => {
    interruptTimeRef.current = interruptTime;
  }, [interruptTime]);

  const sessionActive = useRef(false);
  const sessionEpisodeIdRef = useRef<string | null>(null);
  const latestContext = useRef<EpisodeContextBundle | null>(null);
  const contextRequestIdRef = useRef(0);
  const alignmentRef = useRef<any>(null);
  const vadScoreRef = useRef(0);
  const userSpeakingRef = useRef(false);
  const turn = machine.turn;
  const status = deriveUiStatus(machine);
  const questionText = turn?.question ?? null;
  const answerText = turn?.answer || null;
  const derivedSources = turn?.sources ?? [];
  const savableTurn =
    turn?.committed && turn.answer.trim()
      ? turn
      : lastCompletedTurnRef.current;
  const hasSavableTurn = Boolean(savableTurn?.committed && savableTurn.answer.trim());
  const isSearchingWeb = turn?.phase === 'tool_searching';
  const notionPageUrl = turn?.notionPageUrl ?? null;
  const notionPageTitle = turn?.notionPageTitle ?? null;
  const episodeNotionPageUrl = episodeNotionPage.pageUrl;
  const episodeNotionPageTitle = episodeNotionPage.pageTitle;
  const notionSaveIsNew = turn?.notionSaveIsNew ?? null;
  const notionSaving = turn?.notionSaving ?? false;
  const notionSaveError = turn?.notionSaveError ?? null;
  const errorMessage = machine.session === 'error' || turn?.phase === 'failed'
    ? 'Curio couldn\u2019t answer right now. You can resume playback or try again.'
    : null;

  const saveCurrentTurnToNotion = useCallback(async () => {
    const settings = getNotionSettings();
    if (!settings) {
      const message = 'Notion is not connected yet.';
      dispatchM({ type: 'NOTION_SAVE_ERROR', message });
      return { ok: false as const, message };
    }

    const episode = currentEpisodeRef.current;
    const currentTurn = machineRef.current.turn;
    const targetTurn =
      currentTurn?.committed && currentTurn.answer.trim()
        ? currentTurn
        : lastCompletedTurnRef.current;

    if (!episode) {
      const message = 'No episode is active right now.';
      dispatchM({ type: 'NOTION_SAVE_ERROR', message });
      return { ok: false as const, message };
    }

    if (!targetTurn?.committed || !targetTurn.answer.trim()) {
      const message = 'There is no completed answer to save yet.';
      dispatchM({ type: 'NOTION_SAVE_ERROR', message });
      return { ok: false as const, message };
    }

    if (currentTurn?.notionSaving || targetTurn.notionSaving) {
      return { ok: false as const, message: 'Notion save already in progress.' };
    }

    if (targetTurn.notionPageUrl) {
      return {
        ok: true as const,
        pageUrl: targetTurn.notionPageUrl,
        pageTitle: targetTurn.notionPageTitle || episode.title,
        isNew: false,
        alreadySaved: true,
      };
    }

    dispatchM({ type: 'NOTION_SAVE_START' });

    try {
      const result = await saveToNotion({
        notionToken: settings.token,
        parentPageId: settings.parentPageId,
        episodeId: episode.id,
        feedUrl: episode.feedUrl,
        episodeTitle: episode.title,
        podcastName: episode.podcastName,
        momentTime: formatPlaybackPosition(interruptTimeRef.current),
        question: targetTurn.question || 'What just happened here?',
        answer: targetTurn.answer,
        sources: targetTurn.sources,
      });

      if (machineRef.current.turn?.id === currentTurn?.id) {
        dispatchM({
          type: 'NOTION_SAVED',
          pageUrl: result.pageUrl,
          pageTitle: result.pageTitle,
          isNew: result.isNew,
        });
      } else if (targetTurn.id === lastCompletedTurnRef.current?.id) {
        lastCompletedTurnRef.current = {
          ...targetTurn,
          notionSaving: false,
          notionPageUrl: result.pageUrl,
          notionPageTitle: result.pageTitle,
          notionSaveIsNew: result.isNew,
          notionSaveError: null,
        };
      }

      setEpisodeNotionPage({
        pageUrl: result.pageUrl,
        pageTitle: result.pageTitle,
      });

      return {
        ok: true as const,
        pageUrl: result.pageUrl,
        pageTitle: result.pageTitle,
        isNew: result.isNew,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save to Notion';
      if (machineRef.current.turn?.id === currentTurn?.id) {
        dispatchM({ type: 'NOTION_SAVE_ERROR', message });
      } else if (targetTurn.id === lastCompletedTurnRef.current?.id) {
        lastCompletedTurnRef.current = {
          ...targetTurn,
          notionSaving: false,
          notionSaveError: message,
        };
      }
      return { ok: false as const, message };
    }
  }, []);

  const conversation = useConversation({
    clientTools: {
      search_web: async (params: FirecrawlSearchParams) => {
        const myTurnId = machineRef.current.turn?.id;
        if (looksLikeSaveActionQuery(params.query)) {
          return [
            'search_web rejected this request.',
            'The query looks like a save or bookmark action, not a web research question.',
            'Use save_to_notion instead and do not call search_web again for this user turn.',
          ].join('\n');
        }

        try {
          const results = await firecrawlSearch(params);
          if (machineRef.current.turn?.id !== myTurnId) return '';
          const mappedSources = sourcesFromResults(results.results);
          dispatchM({ type: 'SET_SOURCES', sources: mappedSources });
          return formatSearchToolResult(params, results);
        } catch (error) {
          console.error('Firecrawl search tool failed:', error);
          if (machineRef.current.turn?.id !== myTurnId) return '';
          dispatchM({ type: 'SET_SOURCES', sources: [] });
          const message = error instanceof Error ? error.message : 'search_web failed';
          return `search_web failed: ${message}`;
        }
      },
      save_to_notion: async () => {
        if (machineRef.current.turn?.id !== undefined) {
          notionControlTurnIdsRef.current.add(machineRef.current.turn.id);
        }
        const result = await saveCurrentTurnToNotion();
        if (!result.ok) {
          return `save_to_notion failed: ${result.message}`;
        }

        if ('alreadySaved' in result && result.alreadySaved) {
          return `This answer is already saved to Notion in "${result.pageTitle}": ${result.pageUrl}`;
        }

        return formatNotionToolResult(result.pageUrl, result.pageTitle, result.isNew);
      },
    },
    onMessage: (message: any) => {
      if (message.source === 'user') {
        const currentTurn = machineRef.current.turn;
        if (currentTurn && currentTurn.question === message.message && currentTurn.phase !== 'complete' && currentTurn.phase !== 'failed') {
          return;
        }

        const id = ++turnCounterRef.current;
        dispatchM({ type: 'START_TURN', id, question: message.message || '' });
        dispatchM({ type: 'TRANSITION', phase: 'waiting' });
        return;
      }

      if (message.source === 'ai') {
        const text = typeof message.message === 'string' ? message.message : '';
        if (!text.trim()) return;
        const currentTurn = machineRef.current.turn;
        if (!currentTurn) return;
        const eventId = typeof message.event_id === 'number' ? message.event_id : null;

        if (
          currentTurn.committed &&
          currentTurn.responseEventId !== null &&
          eventId !== currentTurn.responseEventId
        ) {
          return;
        }

        dispatchM({ type: 'REPLACE_ANSWER', text, eventId });

        if (currentTurn.phase !== 'streaming' && currentTurn.phase !== 'complete') {
          dispatchM({ type: 'TRANSITION', phase: 'streaming' });
        }
      }
    },
    onModeChange: ({ mode }: any) => {
      if (mode === 'speaking' && machineRef.current.turn && machineRef.current.turn.phase !== 'failed') {
        if (machineRef.current.turn.phase !== 'streaming' && machineRef.current.turn.phase !== 'complete') {
          dispatchM({ type: 'TRANSITION', phase: 'streaming' });
        }
      }
    },
    onConnect: () => {
      dispatchM({ type: 'SESSION_READY' });
    },
    onDisconnect: ({ reason }: any) => {
      sessionActive.current = false;
      sessionEpisodeIdRef.current = null;
      latestContext.current = null;
      alignmentRef.current = null;

      if (reason === 'user') {
        dispatchM({ type: 'SESSION_DISCONNECTED' });
        return;
      }

      dispatchM({ type: 'FAIL' });
    },
    onAgentChatResponsePart: (part: any) => {
      if (!machineRef.current.turn) return;
      const eventId = typeof part.event_id === 'number' ? part.event_id : null;

      if (part.type === 'start' || part.type === 'delta') {
        const text = part.text || '';

        if (part.type === 'start') {
          dispatchM({ type: 'REPLACE_ANSWER', text, eventId });
          return;
        }

        if (!text) return;

        if (
          machineRef.current.turn.responseEventId !== null &&
          eventId !== null &&
          machineRef.current.turn.responseEventId !== eventId
        ) {
          dispatchM({ type: 'REPLACE_ANSWER', text, eventId });
          return;
        }

        if (machineRef.current.turn.phase !== 'streaming') {
          dispatchM({ type: 'TRANSITION', phase: 'streaming' });
        }
        dispatchM({ type: 'APPEND_ANSWER', text, eventId });
        return;
      }

      if (part.type === 'stop') {
        if (machineRef.current.turn.committed) return;

        dispatchM({ type: 'COMMIT' });
      }
    },
    onAgentToolRequest: (tool: any) => {
      if (tool.tool_name !== 'search_web') return;
      if (!machineRef.current.turn) return;
      dispatchM({ type: 'SET_SEARCH_STRATEGY', strategy: 'tool' });
      dispatchM({ type: 'TRANSITION', phase: 'tool_searching' });
    },
    onAgentToolResponse: (tool: any) => {
      if (tool.tool_name !== 'search_web') return;
      if (!machineRef.current.turn) return;
      if (machineRef.current.turn.phase === 'tool_searching') {
        dispatchM({ type: 'TRANSITION', phase: machineRef.current.turn.answer ? 'streaming' : 'waiting' });
      }
    },
    onAudioAlignment: (alignment: any) => {
      alignmentRef.current = alignment;
    },
    onVadScore: ({ vadScore }: any) => {
      vadScoreRef.current = typeof vadScore === 'number' ? vadScore : 0;
    },
    onError: (error: any) => {
      console.error('ElevenLabs error:', error);
      dispatchM({ type: 'FAIL' });
    },
  });

  useEffect(() => {
    const requestFrame =
      globalThis.requestAnimationFrame?.bind(globalThis) ||
      ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16) as unknown as number);
    const cancelFrame =
      globalThis.cancelAnimationFrame?.bind(globalThis) ||
      ((id: number) => clearTimeout(id));

    let frameId = 0;

    const tick = () => {
      const inputLevel = Math.max(vadScoreRef.current, conversation.getInputVolume?.() || 0);
      const speakingNow = userSpeakingRef.current
        ? inputLevel > USER_SPEAKING_OFF_THRESHOLD
        : inputLevel > USER_SPEAKING_ON_THRESHOLD;
      userSpeakingRef.current = speakingNow;

      const inputBars = sampleFrequencyBars(
        conversation.getInputByteFrequencyData?.(),
        inputLevel,
        INPUT_WAVE_GAIN,
      );
      const outputBars = sampleFrequencyBars(
        conversation.getOutputByteFrequencyData?.(),
        conversation.getOutputVolume?.() || 0,
        OUTPUT_WAVE_GAIN,
      );

      setIsUserSpeaking((current) => (current === speakingNow ? current : speakingNow));
      setInputWaveform((current) => {
        const target = status === 'listening' || speakingNow ? inputBars : createFlatWaveform(0.14);
        const next = smoothWaveform(current, target);
        return waveformEquals(current, next) ? current : next;
      });

      setOutputWaveform((current) => {
        const target = status === 'answering' && conversation.isSpeaking
          ? outputBars
          : createFlatWaveform(0.14);
        const next = smoothWaveform(current, target);
        return waveformEquals(current, next) ? current : next;
      });

      frameId = requestFrame(tick);
    };

    frameId = requestFrame(tick);
    return () => cancelFrame(frameId);
  }, [conversation, status]);

  const stopSession = useCallback(async () => {
    if (!sessionActive.current) return;

    sessionActive.current = false;
    dispatchM({ type: 'SESSION_DISCONNECTED' });
    sessionEpisodeIdRef.current = null;
    latestContext.current = null;
    alignmentRef.current = null;

    try {
      await conversation.endSession();
    } catch {}
  }, [conversation]);

  const buildBootstrapContext = useCallback((description?: string | null): EpisodeContextBundle => ({
    recentSegments: [],
    episodeSummary: '',
    showNotes: description || null,
    episodeSummaryFromWeb: null,
    transcriptStatus: 'pending',
  }), []);

  const ensureTranscript = useCallback(async () => {
    const episode = state.currentEpisode;
    if (!episode) return 'failed' as const;
    const shouldForceRetry = state.transcript?.episodeId === episode.id && state.transcript.status === 'failed';

    if (state.transcript?.episodeId === episode.id) {
      if (state.transcript.status === 'ready') {
        return state.transcript.status;
      }
    }

    dispatch({
      type: 'SET_CONTEXT',
      episodeId: episode.id,
      transcript: buildTranscriptState(episode.id, { status: 'pending' }),
    });

    const startedAt = Date.now();

    while (Date.now() - startedAt < TRANSCRIPT_MAX_WAIT_MS) {
      try {
        const response = await fetchTranscript({
          audioUrl: episode.enclosureUrl,
          episodeId: episode.id,
          transcriptUrl: episode.transcriptUrl,
          feedUrl: episode.feedUrl,
          forceRetry: shouldForceRetry,
        });

        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: response.status,
            segments: response.segments,
            error: response.error || null,
          }),
        });

        if (response.status === 'ready' || response.status === 'failed') {
          return response.status;
        }
      } catch (error) {
        console.error('Failed to fetch transcript on interrupt:', error);
        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to fetch transcript',
          }),
        });
        return 'failed';
      }

      await new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_POLL_INTERVAL_MS));
    }

    return 'pending' as const;
  }, [dispatch, state.currentEpisode, state.transcript]);

  const ensureVoiceSession = useCallback(async (interruptAt: number) => {
    const episode = state.currentEpisode;
    if (!episode) return false;

    if (!AGENT_ID) {
      dispatchM({ type: 'FAIL' });
      return false;
    }

    try {
      const needsFreshSession = !sessionActive.current || sessionEpisodeIdRef.current !== episode.id;

      if (needsFreshSession && sessionActive.current) {
        await stopSession();
      }

      if (needsFreshSession) {
        const bootstrapContext = buildBootstrapContext(episode.description);
        const currentDate = getCurrentDateContext();
        latestContext.current = bootstrapContext;
        const systemPrompt = buildSystemPrompt(episode, bootstrapContext);
        const { signedUrl } = await getSignedUrl(AGENT_ID);

        await conversation.startSession({
          signedUrl,
          connectionType: 'websocket',
          dynamicVariables: {
            podcast_name: episode.podcastName || 'Podcast',
            episode_title: episode.title,
            playback_position: formatPlaybackPosition(interruptAt),
            host_names: episode.hostNames?.join(', ') || 'Unknown',
            current_date_human: currentDate.humanDate,
            current_date_iso: currentDate.isoDate,
            current_year: currentDate.year,
            current_timezone: currentDate.timeZone,
          },
          overrides: {
            agent: {
              prompt: { prompt: systemPrompt },
            },
          },
        } as any);

        sessionActive.current = true;
        sessionEpisodeIdRef.current = episode.id;
      } else {
        try {
          conversation.setVolume({ volume: 1 });
        } catch {}
      }

      dispatchM({ type: 'SESSION_READY' });

      return true;
    } catch (error) {
      console.error('Failed to ensure voice session:', error);
      dispatchM({ type: 'FAIL' });
      return false;
    }
  }, [buildBootstrapContext, conversation, state.currentEpisode, stopSession]);

  const hydrateContext = useCallback(async (interruptAt: number) => {
    const episode = state.currentEpisode;
    if (!episode) return;

    const requestId = ++contextRequestIdRef.current;

    try {
      await ensureTranscript();

      const context = await getContext({
        episodeId: episode.id,
        positionMs: Math.floor(interruptAt * 1000),
        feedUrl: episode.feedUrl,
        episodeUrl: episode.link,
        episodeTitle: episode.title,
      });

      if (contextRequestIdRef.current !== requestId) return;
      if (!sessionActive.current || sessionEpisodeIdRef.current !== episode.id) return;

      latestContext.current = context;
      const currentTranscript = state.transcript?.episodeId === episode.id ? state.transcript : null;

      if (
        context.recentSegments.length > 0 &&
        (!currentTranscript?.segments?.length || currentTranscript.status !== 'ready')
      ) {
        dispatch({
          type: 'SET_CONTEXT',
          episodeId: episode.id,
          transcript: buildTranscriptState(episode.id, {
            status: 'pending',
            segments: context.recentSegments,
            error: null,
          }),
        });
      }

      try {
        conversation.sendContextualUpdate(formatContextDump(episode, context));
      } catch (error) {
        console.warn('Failed to send contextual update:', error);
      }
    } catch (error) {
      if (contextRequestIdRef.current !== requestId) return;
      console.warn('Failed to hydrate interrupt context:', error);
    }
  }, [conversation, dispatch, ensureTranscript, state.currentEpisode, state.transcript]);

  const startInterrupt = useCallback(async () => {
    const episode = state.currentEpisode;
    if (!episode) return;

    const nextInterruptTime = audio.currentTime;
    audio.pause();
    dispatch({ type: 'INTERRUPT' });
    interruptTimeRef.current = nextInterruptTime;
    setInterruptTime(nextInterruptTime);
    dispatchM({ type: 'SESSION_CONNECTING' });
    void refreshEpisodeNotionPage(episode);

    const ready = await ensureVoiceSession(nextInterruptTime);
    if (!ready) return;

    try {
      conversation.sendUserActivity();
    } catch {}

    void hydrateContext(nextInterruptTime);
  }, [audio, conversation, dispatch, ensureVoiceSession, hydrateContext, refreshEpisodeNotionPage, state.currentEpisode]);

  const continueConversation = useCallback(async () => {
    const episode = state.currentEpisode;
    if (!episode) return;

    dispatch({ type: 'INTERRUPT' });
    dispatchM({ type: 'SESSION_CONNECTING' });
    void refreshEpisodeNotionPage(episode);

    const nextInterruptTime = interruptTime || audio.currentTime;
    interruptTimeRef.current = nextInterruptTime;
    setInterruptTime(nextInterruptTime);

    const ready = await ensureVoiceSession(nextInterruptTime);
    if (!ready) return;

    try {
      conversation.sendUserActivity();
    } catch {}

    void hydrateContext(nextInterruptTime);
  }, [conversation, dispatch, ensureVoiceSession, hydrateContext, interruptTime, audio, refreshEpisodeNotionPage, state.currentEpisode]);

  const resumePodcast = useCallback(() => {
    dispatch({ type: 'RESUME' });
    dispatchM({ type: 'RESET' });
    lastCompletedTurnRef.current = null;
    notionControlTurnIdsRef.current.clear();
    void stopSession();
    void audio.resume();
  }, [audio, dispatch, stopSession]);

  const endSession = useCallback(() => {
    void stopSession();
    dispatchM({ type: 'RESET' });
    lastCompletedTurnRef.current = null;
    notionControlTurnIdsRef.current.clear();
    audio.pause();
    dispatch({ type: 'END_EPISODE' });
  }, [audio, dispatch, stopSession]);

  const saveToNotionManual = useCallback(() => {
    void saveCurrentTurnToNotion();
  }, [saveCurrentTurnToNotion]);

  return {
    status,
    questionText,
    answerText,
    sources: derivedSources,
    hasSavableTurn,
    errorMessage,
    interruptTime,
    sessionStatus: conversation.status,
    isAgentSpeaking: conversation.isSpeaking,
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
    transcriptReady: state.transcript?.status === 'ready',
    latestContext: latestContext.current,
    startInterrupt,
    continueConversation,
    saveToNotionManual,
    resumePodcast,
    endSession,
  };
}
