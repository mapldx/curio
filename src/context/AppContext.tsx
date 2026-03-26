import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AppState, AppAction } from '../types';

const STORAGE_KEY = 'curio_app_state';

function loadFromStorage(): Partial<AppState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      skippedEpisodeIds: data.skippedEpisodeIds || [],
    };
  } catch {
    return {};
  }
}

function saveToStorage(state: AppState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      skippedEpisodeIds: state.skippedEpisodeIds,
    }));
  } catch {}
}

const stored = loadFromStorage();

const initialState: AppState = {
  screen: 'discover',
  podcasts: [],
  discoverEpisodes: [],
  currentEpisode: null,
  transcript: null,
  skippedEpisodeIds: stored.skippedEpisodeIds || [],
  discoverTopic: 'Trending',
  libraryVisible: false,
  libraryPodcast: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PODCASTS':
      return { ...state, podcasts: action.podcasts };
    case 'SET_DISCOVER_EPISODES':
      return { ...state, discoverEpisodes: action.episodes };
    case 'SET_DISCOVER_TOPIC':
      return { ...state, discoverTopic: action.topic };
    case 'PLAY_EPISODE':
      return {
        ...state,
        currentEpisode: action.episode,
        screen: 'listening',
        transcript: null,
        libraryVisible: false,
        libraryPodcast: null,
      };
    case 'SET_CONTEXT':
      if (state.currentEpisode?.id !== action.episodeId) return state;
      return { ...state, transcript: action.transcript };
    case 'INTERRUPT':
      return { ...state, screen: 'interrupted' };
    case 'RESUME':
      return { ...state, screen: 'listening' };
    case 'MINIMIZE_PLAYER':
      return { ...state, screen: 'discover' };
    case 'OPEN_PLAYER':
      return state.currentEpisode ? { ...state, screen: 'listening' } : state;
    case 'END_EPISODE':
      return {
        ...state,
        currentEpisode: null,
        screen: 'discover',
        transcript: null,
      };
    case 'SKIP_EPISODE':
      if (state.skippedEpisodeIds.includes(action.episodeId)) return state;
      return { ...state, skippedEpisodeIds: [...state.skippedEpisodeIds, action.episodeId] };
    case 'OPEN_LIBRARY':
      return { ...state, libraryVisible: true, libraryPodcast: action.podcast || null };
    case 'CLOSE_LIBRARY':
      return { ...state, libraryVisible: false, libraryPodcast: null };
    default:
      return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    saveToStorage(state);
  }, [state.skippedEpisodeIds]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
