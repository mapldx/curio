import type {
  EpisodeContextBundle,
  FirecrawlSearchParams,
  FirecrawlSearchResponse,
  NotionSaveParams,
  NotionSaveResponse,
  NotionStatusParams,
  NotionStatusResponse,
  Podcast,
  TranscriptSegment,
} from '../types';

const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

function isPrivateIpv4Host(host: string) {
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

function shouldMirrorLocalApiToPageHost(host: string) {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    isPrivateIpv4Host(host) ||
    host.endsWith('.local')
  );
}

function resolveApiUrl() {
  if (typeof window === 'undefined') return RAW_API_URL;

  try {
    const configured = new URL(RAW_API_URL);
    const configuredHost = configured.hostname;
    const isLocalConfiguredHost =
      configuredHost === 'localhost' ||
      configuredHost === '127.0.0.1' ||
      configuredHost === '0.0.0.0';
    const pageHost = window.location.hostname;
    const isRemotePageHost =
      pageHost &&
      pageHost !== 'localhost' &&
      pageHost !== '127.0.0.1' &&
      pageHost !== '0.0.0.0';

    if (!isLocalConfiguredHost || !isRemotePageHost) {
      return RAW_API_URL;
    }

    if (!shouldMirrorLocalApiToPageHost(pageHost)) {
      return RAW_API_URL;
    }

    return `${window.location.protocol}//${pageHost}:${configured.port || '8787'}`;
  } catch {
    return RAW_API_URL;
  }
}

function apiUrl(path: string) {
  return `${resolveApiUrl()}${path}`;
}

interface TranscriptResponse {
  status: 'ready' | 'pending' | 'failed';
  segments?: TranscriptSegment[];
  error?: string | null;
}

function buildHeaders(includeJson = true) {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
    'ngrok-skip-browser-warning': '1',
  };
}

export async function fetchTrending(): Promise<Podcast[]> {
  const res = await fetch(apiUrl('/api/trending'), {
    headers: buildHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch trending');
  return res.json();
}

export async function searchPodcasts(query: string) {
  const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query)}`), {
    headers: buildHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export async function fetchFeed(feedUrl: string) {
  const res = await fetch(apiUrl(`/api/feed?url=${encodeURIComponent(feedUrl)}`), {
    headers: buildHeaders(false),
  });
  if (!res.ok) throw new Error('Failed to fetch feed');
  return res.json();
}

export async function fetchTranscript(params: {
  audioUrl?: string;
  episodeId: string;
  transcriptUrl?: string;
  feedUrl?: string;
  forceRetry?: boolean;
}): Promise<TranscriptResponse> {
  const res = await fetch(apiUrl('/api/transcript'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to fetch transcript');
  return res.json();
}

export async function getContext(params: {
  episodeId: string;
  positionMs: number;
  feedUrl?: string;
  episodeUrl?: string;
  episodeTitle?: string;
}): Promise<EpisodeContextBundle> {
  const res = await fetch(apiUrl('/api/context'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to get context');
  return res.json();
}

export async function firecrawlSearch(
  params: FirecrawlSearchParams,
): Promise<FirecrawlSearchResponse> {
  const res = await fetch(apiUrl('/api/firecrawl-search'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to search Firecrawl');
  }
  return res.json();
}

export async function saveToNotion(
  params: NotionSaveParams,
): Promise<NotionSaveResponse> {
  const res = await fetch(apiUrl('/api/notion/save'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text;

    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error || text;
    } catch {}

    throw new Error(message || 'Failed to save to Notion');
  }

  return res.json();
}

export async function getNotionStatus(
  params: NotionStatusParams,
): Promise<NotionStatusResponse> {
  const res = await fetch(apiUrl('/api/notion/status'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text;

    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error || text;
    } catch {}

    throw new Error(message || 'Failed to get Notion status');
  }

  return res.json();
}

export async function getSignedUrl(agentId: string) {
  const res = await fetch(apiUrl('/api/session'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ agentId }),
  });
  if (!res.ok) throw new Error('Failed to get signed URL');
  return res.json();
}
