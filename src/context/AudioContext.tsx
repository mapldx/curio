import React, { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from 'react';

interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  error: string | null;
}

interface AudioControls {
  play: (url: string) => Promise<boolean>;
  pause: () => void;
  resume: () => Promise<boolean>;
  seek: (time: number) => void;
  skip: (seconds: number) => void;
  clearError: () => void;
}

const AudioContext = createContext<(AudioState & AudioControls) | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setState(s => ({ ...s, currentTime: audio.currentTime }));
    const onDurationChange = () => setState(s => ({ ...s, duration: audio.duration || 0 }));
    const onPlaying = () => setState(s => ({ ...s, isPlaying: true, isLoading: false, error: null }));
    const onPause = () => setState(s => ({ ...s, isPlaying: false }));
    const onWaiting = () => setState(s => ({ ...s, isLoading: true }));
    const onCanPlay = () => setState(s => ({ ...s, isLoading: false, error: null }));

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const play = useCallback(async (url: string) => {
    const audio = audioRef.current;
    if (!audio) return false;
    setState(s => ({ ...s, error: null }));
    if (audio.src !== url) {
      audio.src = url;
      setState(s => ({ ...s, isLoading: true, currentTime: 0, duration: 0 }));
    }
    try {
      await audio.play();
      return true;
    } catch {
      setState(s => ({
        ...s,
        isLoading: false,
        isPlaying: false,
        error: 'Playback was blocked. Tap play to try again.',
      }));
      return false;
    }
  }, []);

  const pause = useCallback(() => { audioRef.current?.pause(); }, []);
  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    setState(s => ({ ...s, error: null }));
    try {
      await audio.play();
      return true;
    } catch {
      setState(s => ({
        ...s,
        isLoading: false,
        isPlaying: false,
        error: 'Playback was blocked. Tap play to try again.',
      }));
      return false;
    }
  }, []);
  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);
  const skip = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime += seconds;
  }, []);

  return (
    <AudioContext.Provider value={{ ...state, play, pause, resume, seek, skip, clearError }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be inside AudioProvider');
  return ctx;
}
