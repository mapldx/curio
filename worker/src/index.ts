import { XMLParser } from 'fast-xml-parser';
import { decodeHTML } from 'entities';
import { Client, APIErrorCode, isNotionClientError, type BlockObjectRequest } from '@notionhq/client';

type TranscriptStatus = 'processing' | 'ready' | 'failed';

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  FIRECRAWL_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  GROQ_API_KEY?: string;
  GROQ_MAX_AUDIO_BYTES?: string;
  API_SECRET?: string;
  GROQ_TRANSCRIPTION_MODEL?: string;
  TRANSCRIPT_KV: KVNamespace;
}

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

interface TranscriptRecord {
  status: TranscriptStatus;
  segments?: TranscriptSegment[];
  error?: string;
  updatedAt: number;
}

interface FirecrawlSearchBody {
  query: string;
  sources?: string[];
  categories?: string[];
  tbs?: string;
  location?: string;
}

interface NotionSaveSource {
  url?: string;
  title?: string;
  date?: string;
  imageUrl?: string;
}

interface NotionSaveBody {
  notionToken?: string;
  parentPageId?: string;
  episodeId?: string;
  feedUrl?: string;
  episodeTitle?: string;
  podcastName?: string;
  momentTime?: string;
  question?: string;
  answer?: string;
  sources?: NotionSaveSource[];
}

interface NormalizedFirecrawlResult {
  title: string;
  url: string;
  content?: string;
  date?: string;
  links?: string[];
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface FeedEpisode {
  id: string;
  title: string;
  description: string;
  enclosureUrl: string;
  duration: number;
  pubDate: string;
  link: string;
  imageUrl: string;
  transcriptUrl?: string;
  feedUrl?: string;
  hostNames?: string[];
  podcastName?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, ngrok-skip-browser-warning',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  trimValues: true,
});

const trendingCache = new Map<string, { data: unknown; expiry: number }>();
const TRANSCRIPT_PROCESSING_STALE_MS = 10 * 60 * 1000;
const DEFAULT_GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';
const DEFAULT_GROQ_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const FIRECRAWL_SEARCH_TIMEOUT_MS = 12000;
const FIRECRAWL_NETWORK_GRACE_MS = 2000;
const FEED_FETCH_TIMEOUT_MS = 8000;
const NOTION_SAVE_TIMEOUT_MS = 12000;
const NOTION_STATUS_TIMEOUT_MS = 4000;
const NOTION_TEXT_CHUNK_SIZE = 1800;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/trending' && request.method === 'GET') {
        return handleTrending();
      }
      if (path === '/api/search' && request.method === 'GET') {
        return handleSearch(url);
      }
      if (path === '/api/feed' && request.method === 'GET') {
        return handleFeed(url);
      }
      if (path === '/api/transcript' && request.method === 'POST') {
        return handleTranscript(request, env, ctx);
      }
      if (path === '/api/context' && request.method === 'POST') {
        return handleContext(request, env);
      }
      if (path === '/api/notion/save' && request.method === 'POST') {
        return handleNotionSave(request, env);
      }
      if (path === '/api/notion/status' && request.method === 'POST') {
        return handleNotionStatus(request, env);
      }
      if (path === '/api/firecrawl-search' && request.method === 'POST') {
        return handleFirecrawlSearch(request, env);
      }
      if (path === '/api/session' && request.method === 'POST') {
        return handleSession(request, env);
      }
      return error('Not found', 404);
    } catch (err) {
      return error(err instanceof Error ? err.message : 'Internal error', 500);
    }
  },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(message: string, status = 400) {
  return json({ error: message }, status);
}

function requireApiKey(request: Request, env: Env): Response | null {
  const expected = env.API_SECRET;
  if (!expected) return null;

  const actual = request.headers.get('X-API-Key');
  if (actual !== expected) {
    return error('Unauthorized', 401);
  }

  return null;
}

async function handleTrending(): Promise<Response> {
  return handleTopChartsTrending();
}

async function handleTopChartsTrending(): Promise<Response> {
  const cacheKey = 'itunes-top-charts';
  const cached = trendingCache.get(cacheKey);

  if (cached && Date.now() < cached.expiry) {
    return json(cached.data);
  }

  const res = await fetch('https://itunes.apple.com/us/rss/toppodcasts/limit=20/json');
  const feed = await res.json() as any;
  const entries = feed?.feed?.entry || [];

  const ids = entries.map((entry: any) => entry.id?.attributes?.['im:id']).filter(Boolean);
  const lookupUrl = `https://itunes.apple.com/lookup?id=${ids.join(',')}&entity=podcast`;
  const lookupRes = await fetch(lookupUrl);
  const lookupData = await lookupRes.json() as any;
  const lookupMap = new Map<string, any>();

  for (const result of lookupData.results || []) {
    lookupMap.set(String(result.collectionId), result);
  }

  const podcasts = entries
    .map((entry: any) => {
      const id = entry.id?.attributes?.['im:id'];
      const lookup = lookupMap.get(id);
      const images = entry['im:image'] || [];
      const largestImage = images[images.length - 1]?.label || '';

      return {
        id,
        name: entry['im:name']?.label || '',
        author: entry['im:artist']?.label || '',
        artworkUrl: lookup?.artworkUrl600 || largestImage,
        feedUrl: lookup?.feedUrl || '',
        genre: entry.category?.attributes?.label || '',
        episodeCount: lookup?.trackCount,
      };
    })
    .filter((podcast: any) => podcast.feedUrl);

  trendingCache.set(cacheKey, {
    data: podcasts,
    expiry: Date.now() + 60 * 60 * 1000,
  });

  return json(podcasts);
}

async function handleSearch(url: URL): Promise<Response> {
  const query = url.searchParams.get('q');
  if (!query) return error('Missing q parameter');

  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&limit=20`;
  const res = await fetch(searchUrl);
  const data = await res.json() as any;

  const podcasts = (data.results || []).map((result: any) => ({
    id: String(result.collectionId),
    name: result.collectionName,
    author: result.artistName,
    artworkUrl: result.artworkUrl600 || result.artworkUrl100,
    feedUrl: result.feedUrl,
    genre: result.primaryGenreName,
    episodeCount: result.trackCount,
  }));

  return json(podcasts);
}

async function handleFeed(url: URL): Promise<Response> {
  const feedUrl = url.searchParams.get('url');
  if (!feedUrl) return error('Missing url parameter');

  let res: Response;
  try {
    res = await fetchWithTimeout(feedUrl, {
      headers: {
        'User-Agent': 'Curio/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      },
    }, FEED_FETCH_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Feed request failed';
    const status = message === 'Feed request timed out' ? 504 : 502;
    return error(message, status);
  }

  if (!res.ok) {
    return error(`Feed request failed with ${res.status}`, 502);
  }

  const xml = await res.text();
  const parsed = parseFeedXml(xml, feedUrl);
  const channel = parsed?.rss?.channel || parsed?.feed || {};
  const items = asArray(channel.item || channel.entry);
  const hostNames = extractHostNames(channel);
  const channelImage = getImageUrl(channel['itunes:image']) || getImageUrl(channel.image);

  const episodes = items
    .slice(0, 30)
    .map((item, index): FeedEpisode | null => {
      const enclosure = item.enclosure || {};
      const enclosureUrl = enclosure['@_url'] || enclosure.href || '';
      if (!enclosureUrl) return null;

      const transcriptUrl = extractTranscriptUrl(item['podcast:transcript']) || extractTranscriptUrl(channel['podcast:transcript']);
      const imageUrl =
        getImageUrl(item['itunes:image']) ||
        getImageUrl(item.image) ||
        channelImage ||
        '';

      return {
        id: getText(item.guid) || getText(item.id) || `ep-${index}`,
        title: getText(item.title),
        description: stripHtml(getText(item.description) || getText(item['content:encoded'])),
        enclosureUrl,
        duration: parseDuration(getText(item['itunes:duration']) || getText(item.duration)),
        pubDate: getText(item.pubDate) || getText(item.published),
        link: getText(item.link),
        imageUrl,
        transcriptUrl: transcriptUrl || undefined,
        feedUrl,
        hostNames,
      };
    })
    .filter(Boolean);

  return json(episodes);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Feed request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseFeedXml(xml: string, feedUrl?: string) {
  try {
    return parser.parse(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sanitized = sanitizeFeedXml(xml);

    if (sanitized !== xml) {
      try {
        console.warn(`Retrying feed parse after XML sanitization for ${feedUrl || 'unknown feed'}: ${message}`);
        return parser.parse(sanitized);
      } catch {}
    }

    throw error;
  }
}

function sanitizeFeedXml(xml: string) {
  let sanitized = xml.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  const openCdata = sanitized.match(/<!\[CDATA\[/g)?.length || 0;
  const closeCdata = sanitized.match(/\]\]>/g)?.length || 0;
  if (openCdata > closeCdata) {
    sanitized += ']]>'.repeat(openCdata - closeCdata);
  }

  return sanitized;
}

async function handleTranscript(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const body = await request.json() as {
    audioUrl?: string;
    episodeId?: string;
    transcriptUrl?: string;
    feedUrl?: string;
    forceRetry?: boolean;
  };

  const { audioUrl, episodeId, transcriptUrl, feedUrl, forceRetry } = body;
  if (!episodeId) return error('Missing episodeId');

  const key = await buildTranscriptKey(feedUrl, episodeId);
  const record = await readTranscriptRecord(env.TRANSCRIPT_KV, key);

  if (record?.status === 'ready') {
    return json({ status: 'ready', segments: record.segments || [] });
  }

  if (record?.status === 'processing' && Date.now() - record.updatedAt < TRANSCRIPT_PROCESSING_STALE_MS) {
    return json({ status: 'pending' });
  }

  if (record?.status === 'failed' && !forceRetry) {
    return json({
      status: 'failed',
      error: record.error || 'Transcription failed',
    });
  }

  const canTranscribeFromAudio = Boolean(audioUrl && env.GROQ_API_KEY);

  if (transcriptUrl) {
    try {
      const segments = await fetchAndParseTranscript(transcriptUrl);
      await putTranscriptRecord(env.TRANSCRIPT_KV, key, {
        status: 'ready',
        segments,
        updatedAt: Date.now(),
      });
      return json({ status: 'ready', segments });
    } catch (err) {
      if (!canTranscribeFromAudio) {
        await putTranscriptRecord(env.TRANSCRIPT_KV, key, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Failed to parse transcript',
          updatedAt: Date.now(),
        });
        return json({ status: 'failed' }, 200);
      }
    }
  }

  if (!canTranscribeFromAudio) {
    await putTranscriptRecord(env.TRANSCRIPT_KV, key, {
      status: 'failed',
      error: 'No transcript source available',
      updatedAt: Date.now(),
    });
    return json({ status: 'failed' }, 200);
  }

  await putTranscriptRecord(env.TRANSCRIPT_KV, key, {
    status: 'processing',
    updatedAt: Date.now(),
  });

  ctx.waitUntil(
    transcribeEpisode(env, key, audioUrl as string).catch(async (err) => {
      await putTranscriptRecord(env.TRANSCRIPT_KV, key, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Transcription failed',
        updatedAt: Date.now(),
      });
    }),
  );

  return json({ status: 'pending' });
}

async function handleContext(request: Request, env: Env): Promise<Response> {
  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const body = await request.json() as {
    episodeId?: string;
    positionMs?: number;
    feedUrl?: string;
    episodeUrl?: string;
    episodeTitle?: string;
  };

  const { episodeId, positionMs = 0, feedUrl, episodeUrl, episodeTitle } = body;
  if (!episodeId) return error('Missing episodeId');

  const key = await buildTranscriptKey(feedUrl, episodeId);
  const record = await readTranscriptRecord(env.TRANSCRIPT_KV, key);
  const segments = record?.status === 'ready' ? record.segments || [] : [];
  const recentSegments = segments.filter((segment) => (
    segment.startMs <= positionMs + 10000 && segment.endMs >= positionMs - 90000
  ));
  const summarySource = segments
    .filter((segment) => segment.startMs <= positionMs + 1000)
    .map((segment) => formatSegmentText(segment))
    .join(' ');

  const [showNotes, episodeSummaryFromWeb] = await Promise.all([
    fetchShowNotes(episodeUrl),
    fetchEpisodeSummaryFromWeb(env, episodeTitle),
  ]);

  return json({
    recentSegments,
    episodeSummary: truncateFromEnd(summarySource, 2000),
    showNotes,
    episodeSummaryFromWeb,
    transcriptStatus: record?.status || 'failed',
  });
}

async function handleFirecrawlSearch(request: Request, env: Env): Promise<Response> {
  const authError = requireApiKey(request, env);
  if (authError) return authError;

  if (!env.FIRECRAWL_API_KEY) return error('Missing Firecrawl API key', 500);

  const body = await request.json() as FirecrawlSearchBody;
  if (!body.query?.trim()) return error('Missing query');
  const normalizedSources = body.sources && body.sources.length > 0 ? body.sources : ['web'];
  const includesImages = normalizedSources.includes('images');

  const data = await firecrawlSearch(env, {
    query: body.query.trim(),
    limit: includesImages ? 4 : 5,
    sources: normalizedSources,
    categories: body.categories && body.categories.length > 0 ? body.categories : undefined,
    tbs: body.tbs,
    location: body.location,
    country: 'US',
    timeout: FIRECRAWL_SEARCH_TIMEOUT_MS,
    ignoreInvalidURLs: true,
  });

  return json({
    results: normalizeFirecrawlResults(data?.data),
    warning: data?.warning || null,
  });
}

async function handleNotionSave(request: Request, env: Env): Promise<Response> {
  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const body = await request.json() as NotionSaveBody;
  const notionToken = body.notionToken?.trim();
  const parentPageId = normalizeNotionPageId(body.parentPageId || '');
  const episodeId = body.episodeId?.trim();
  const episodeTitle = body.episodeTitle?.trim();
  const question = body.question?.trim();
  const answer = body.answer?.trim();

  if (!notionToken) return error('Missing notionToken');
  if (!parentPageId) return error('Missing parentPageId');
  if (!episodeId) return error('Missing episodeId');
  if (!episodeTitle) return error('Missing episodeTitle');
  if (!answer) return error('Missing answer');

  const notion = createNotionClient(notionToken, NOTION_SAVE_TIMEOUT_MS);
  const storageKey = await getNotionStorageKey(parentPageId, body.feedUrl, episodeId);
  const existingPageId = normalizeNotionPageId((await env.TRANSCRIPT_KV.get(storageKey)) || '');
  const sources = sanitizeNotionSources(body.sources);
  const pageInput = {
    parentPageId,
    episodeTitle,
    podcastName: body.podcastName?.trim() || 'Podcast',
    momentTime: body.momentTime?.trim() || 'Unknown time',
    question: question || 'Saved from Curio',
    answer,
    sources,
  };

  try {
    if (!existingPageId) {
      const page = await createEpisodeNotionPage(notion, pageInput);
      await env.TRANSCRIPT_KV.put(storageKey, page.id);
      return json({
        pageUrl: getNotionPageUrl(page.id, getPageUrl(page)),
        isNew: true,
        pageTitle: episodeTitle,
      });
    }

    try {
      await notion.blocks.children.append({
        block_id: existingPageId,
        children: buildMomentBlocks(pageInput),
      });
      return json({
        pageUrl: getNotionPageUrl(existingPageId),
        isNew: false,
        pageTitle: episodeTitle,
      });
    } catch (appendError) {
      if (isNotionClientError(appendError) && appendError.code === APIErrorCode.ObjectNotFound) {
        const page = await createEpisodeNotionPage(notion, pageInput);
        await env.TRANSCRIPT_KV.put(storageKey, page.id);
        return json({
          pageUrl: getNotionPageUrl(page.id, getPageUrl(page)),
          isNew: true,
          pageTitle: episodeTitle,
        });
      }

      return notionErrorResponse(appendError);
    }
  } catch (notionError) {
    return notionErrorResponse(notionError);
  }
}

async function handleNotionStatus(request: Request, env: Env): Promise<Response> {
  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const body = await request.json() as NotionSaveBody;
  const notionToken = body.notionToken?.trim();
  const parentPageId = normalizeNotionPageId(body.parentPageId || '');
  const episodeId = body.episodeId?.trim();
  const episodeTitle = body.episodeTitle?.trim();

  if (!notionToken) return error('Missing notionToken');
  if (!parentPageId) return error('Missing parentPageId');
  if (!episodeId) return error('Missing episodeId');
  if (!episodeTitle) return error('Missing episodeTitle');

  const storageKey = await getNotionStorageKey(parentPageId, body.feedUrl, episodeId);
  const existingPageId = normalizeNotionPageId((await env.TRANSCRIPT_KV.get(storageKey)) || '');

  if (!existingPageId) {
    return json({ exists: false, pageUrl: null, pageTitle: null });
  }

  const notion = createNotionClient(notionToken, NOTION_STATUS_TIMEOUT_MS);

  try {
    const page = await notion.pages.retrieve({ page_id: existingPageId });
    return json({
      exists: true,
      pageUrl: getNotionPageUrl(existingPageId, getPageUrl(page as Record<string, unknown> & { id: string })),
      pageTitle: episodeTitle,
    });
  } catch (notionError) {
    if (isNotionClientError(notionError) && notionError.code === APIErrorCode.ObjectNotFound) {
      await env.TRANSCRIPT_KV.delete(storageKey);
      return json({ exists: false, pageUrl: null, pageTitle: null });
    }

    return notionErrorResponse(notionError);
  }
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { agentId?: string };
  const { agentId } = body;
  if (!agentId) return error('Missing agentId');

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    },
  );

  const data = await res.json() as any;
  if (!data.signed_url) return error('Failed to get signed URL', 502);

  return json({ signedUrl: data.signed_url });
}

function createNotionClient(notionToken: string, timeoutMs: number) {
  return new Client({
    auth: notionToken,
    fetch: (url, init) => fetchWithAbortTimeout(url, init, timeoutMs),
  });
}

async function createEpisodeNotionPage(
  notion: Client,
  input: {
    parentPageId: string;
    episodeTitle: string;
    podcastName: string;
    momentTime: string;
    question: string;
    answer: string;
    sources: NotionSaveSource[];
  },
) {
  return notion.pages.create({
    parent: { page_id: input.parentPageId },
    properties: {
      title: {
        title: buildRichText(input.episodeTitle),
      },
    },
    children: [
      headingBlock('heading_2', input.podcastName),
      paragraphBlock(`Saved from Curio | ${formatNotionDate(new Date())}`),
      dividerBlock(),
      ...buildMomentBlocks(input, false),
    ],
  });
}

function buildMomentBlocks(
  input: {
    momentTime: string;
    question: string;
    answer: string;
    sources: NotionSaveSource[];
  },
  includeLeadingDivider = true,
): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  if (includeLeadingDivider) {
    blocks.push(dividerBlock());
  }

  blocks.push(
    headingBlock('heading_3', `Moment at ${input.momentTime}`),
    quoteBlock(input.question),
    paragraphBlock(input.answer),
  );

  if (input.sources.length > 0) {
    blocks.push(headingBlock('heading_3', 'Sources'));
    for (const source of input.sources) {
      blocks.push(bulletedListItemBlock(source.title || getUrlDomain(source.url || ''), source.url));
    }
  }

  return blocks;
}

function headingBlock(type: 'heading_2' | 'heading_3', content: string): BlockObjectRequest {
  return {
    object: 'block',
    type,
    [type]: {
      rich_text: buildRichText(content),
    },
  } as BlockObjectRequest;
}

function paragraphBlock(content: string): BlockObjectRequest {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: buildRichText(content),
    },
  };
}

function quoteBlock(content: string): BlockObjectRequest {
  return {
    object: 'block',
    type: 'quote',
    quote: {
      rich_text: buildRichText(content),
    },
  };
}

function dividerBlock(): BlockObjectRequest {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

function bulletedListItemBlock(content: string, link?: string): BlockObjectRequest {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: buildRichText(content, link),
    },
  };
}

function buildRichText(content: string, link?: string) {
  const safeContent = content.trim() || 'Untitled';
  return chunkText(safeContent, NOTION_TEXT_CHUNK_SIZE).map((chunk) => ({
    type: 'text' as const,
    text: {
      content: chunk,
      link: link ? { url: link } : null,
    },
  }));
}

function chunkText(value: string, maxLength: number) {
  const normalized = value.replace(/\r\n/g, '\n');
  const chunks: string[] = [];

  for (let index = 0; index < normalized.length; index += maxLength) {
    chunks.push(normalized.slice(index, index + maxLength));
  }

  return chunks.length > 0 ? chunks : [''];
}

function sanitizeNotionSources(sources: NotionSaveSource[] | undefined) {
  return (sources || [])
    .filter((source): source is NotionSaveSource & { url: string } => Boolean(source?.url?.trim()))
    .slice(0, 8)
    .map((source) => ({
      ...source,
      url: source.url.trim(),
      title: (source.title || '').trim() || getUrlDomain(source.url.trim()),
    }));
}

async function getNotionStorageKey(parentPageId: string, feedUrl: string | undefined, episodeId: string) {
  return `notion:${parentPageId}:${await simpleHash(`${feedUrl || ''}|${episodeId}`)}`;
}

function getNotionPageUrl(pageId: string, fallbackUrl?: string) {
  if (fallbackUrl) return fallbackUrl;
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}

function getPageUrl(page: { id: string } & Record<string, unknown>) {
  return typeof page.url === 'string' ? page.url : undefined;
}

function normalizeNotionPageId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const hyphenated = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.[0];
  if (hyphenated) {
    return hyphenated.toLowerCase();
  }

  const compact = trimmed.match(/[0-9a-fA-F]{32}/)?.[0];
  if (!compact) {
    return trimmed;
  }

  return compact
    .replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
      '$1-$2-$3-$4-$5',
    )
    .toLowerCase();
}

function formatNotionDate(date: Date) {
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function notionErrorResponse(errorValue: unknown) {
  if (isNotionClientError(errorValue)) {
    if (
      errorValue.code === APIErrorCode.Unauthorized ||
      errorValue.code === APIErrorCode.RestrictedResource
    ) {
      return error('Notion token invalid or page not shared with integration', 403);
    }

    if (errorValue.code === APIErrorCode.ObjectNotFound) {
      return error('Notion page not found or not shared with integration', 404);
    }

    if (errorValue.code === APIErrorCode.RateLimited) {
      return error('Notion is rate limiting requests right now. Try again in a moment.', 429);
    }
  }

  if (errorValue instanceof Error && errorValue.message === 'Notion request timed out') {
    return error(errorValue.message, 504);
  }

  return error(
    errorValue instanceof Error ? errorValue.message : 'Failed to save to Notion',
    502,
  );
}

async function fetchWithAbortTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = init.signal;
  const abortUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort();
    } else {
      upstreamSignal.addEventListener('abort', abortUpstream, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (errorValue) {
    if (errorValue instanceof Error && errorValue.name === 'AbortError') {
      throw new Error('Notion request timed out');
    }
    throw errorValue;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener('abort', abortUpstream);
  }
}

async function simpleHash(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getUrlDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function firecrawlSearch(env: Env, body: Record<string, unknown>) {
  const requestTimeoutMs =
    typeof body.timeout === 'number' && Number.isFinite(body.timeout)
      ? Math.max(1000, Math.floor(body.timeout))
      : FIRECRAWL_SEARCH_TIMEOUT_MS;
  const localAbortMs = requestTimeoutMs + FIRECRAWL_NETWORK_GRACE_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), localAbortMs);

  let res: Response;
  const query = typeof body.query === 'string' ? body.query : '<unknown query>';
  const startedAt = Date.now();
  try {
    res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Firecrawl request exceeded local timeout after ${localAbortMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `Firecrawl search failed in ${Date.now() - startedAt}ms for "${query}" with ${res.status}: ` +
      truncateFromEnd(text, 300),
    );
    throw new Error(`Firecrawl search failed with ${res.status}: ${truncateFromEnd(text, 300)}`);
  }

  return res.json() as Promise<any>;
}

async function fetchAndParseTranscript(transcriptUrl: string): Promise<TranscriptSegment[]> {
  const res = await fetch(transcriptUrl, {
    headers: { 'User-Agent': 'Curio/1.0' },
  });

  if (!res.ok) {
    throw new Error(`Transcript fetch failed with ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const normalizedUrl = transcriptUrl.toLowerCase();

  if (contentType.includes('vtt') || normalizedUrl.endsWith('.vtt') || text.startsWith('WEBVTT')) {
    return parseVTT(text);
  }

  if (contentType.includes('srt') || normalizedUrl.endsWith('.srt')) {
    return parseSRT(text);
  }

  throw new Error('Unsupported transcript format');
}

async function transcribeEpisode(env: Env, key: string, audioUrl: string) {
  if (env.GROQ_API_KEY) {
    await transcribeWithGroq(env, key, audioUrl);
    return;
  }

  throw new Error('No Groq transcription provider configured');
}

async function transcribeWithGroq(env: Env, key: string, audioUrl: string) {
  const audioResponse = await fetch(audioUrl, {
    headers: buildAudioFetchHeaders(audioUrl),
  });

  if (!audioResponse.ok) {
    throw new Error(`Audio fetch for Groq failed with ${audioResponse.status}`);
  }

  const maxAudioBytes = parsePositiveInt(env.GROQ_MAX_AUDIO_BYTES) || DEFAULT_GROQ_MAX_AUDIO_BYTES;
  const contentLength = parsePositiveInt(audioResponse.headers.get('content-length'));
  if (contentLength && contentLength > maxAudioBytes) {
    throw new Error(
      `Episode audio is too large for Groq (${formatBytes(contentLength)} > ${formatBytes(maxAudioBytes)}). ` +
      'Groq currently caps speech-to-text uploads at 25MB on free tier and 100MB on dev tier.',
    );
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  if (audioBuffer.byteLength > maxAudioBytes) {
    throw new Error(
      `Episode audio is too large for Groq (${formatBytes(audioBuffer.byteLength)} > ${formatBytes(maxAudioBytes)}). ` +
      'Groq currently caps speech-to-text uploads at 25MB on free tier and 100MB on dev tier.',
    );
  }

  const audioPath = safeAudioFilename(audioUrl);
  const audioContentType = audioResponse.headers.get('content-type') || guessAudioContentType(audioPath);
  const form = new FormData();
  form.append('model', env.GROQ_TRANSCRIPTION_MODEL || DEFAULT_GROQ_TRANSCRIPTION_MODEL);
  form.append('file', new Blob([audioBuffer], { type: audioContentType }), audioPath);
  form.append('prompt', 'Podcast conversation transcript. Preserve names of people, companies, and products when possible.');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq transcription failed with ${res.status}: ${truncateFromEnd(text, 300)}`);
  }

  const data = await res.json() as {
    segments?: Array<{
      start?: number;
      end?: number;
      text?: string;
    }>;
  };

  const segments = normalizeTranscriptSegments(
    (data.segments || []).map((segment) => ({
      startMs: Math.round(Number(segment.start || 0) * 1000),
      endMs: Math.round(Number(segment.end || 0) * 1000),
      text: typeof segment.text === 'string' ? segment.text : '',
    })),
  );

  if (segments.length === 0) {
    throw new Error('Groq returned no transcript segments');
  }

  await putTranscriptRecord(env.TRANSCRIPT_KV, key, {
    status: 'ready',
    segments,
    updatedAt: Date.now(),
  });
}

async function fetchShowNotes(episodeUrl?: string) {
  if (!episodeUrl) return null;

  try {
    const res = await fetch(episodeUrl, {
      headers: { 'User-Agent': 'Curio/1.0' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtml(html).slice(0, 4000);
  } catch {
    return null;
  }
}

async function fetchEpisodeSummaryFromWeb(env: Env, episodeTitle?: string) {
  if (!episodeTitle || !env.FIRECRAWL_API_KEY) return null;

  try {
    const data = await firecrawlSearch(env, {
      query: `${episodeTitle} summary`,
      limit: 1,
      ignoreInvalidURLs: true,
      scrapeOptions: {
        formats: [{ type: 'summary' }],
      },
    });

    const first = normalizeFirecrawlResults(data?.data)[0];
    return first?.content || null;
  } catch {
    return null;
  }
}

function normalizeFirecrawlResults(data: any): NormalizedFirecrawlResult[] {
  const webResults: NormalizedFirecrawlResult[] = asArray<any>(data?.web).map((result) => ({
    title: result.title || result.metadata?.title || '',
    url: result.url || result.metadata?.sourceURL || result.metadata?.url || '',
    content: result.summary || result.markdown || result.description || result.metadata?.description || '',
    links: Array.isArray(result.links) ? result.links : undefined,
    imageUrl: result.imageUrl || undefined,
  }));

  const newsResults: NormalizedFirecrawlResult[] = asArray<any>(data?.news).map((result) => ({
    title: result.title || '',
    url: result.url || result.metadata?.sourceURL || '',
    content: result.summary || result.markdown || result.snippet || result.metadata?.description || '',
    date: result.date || undefined,
    links: Array.isArray(result.links) ? result.links : undefined,
    imageUrl: result.imageUrl || undefined,
  }));

  const imageResults: NormalizedFirecrawlResult[] = asArray<any>(data?.images).map((result) => ({
    title: result.title || '',
    url: result.url || result.imageUrl || '',
    imageUrl: result.imageUrl || undefined,
    imageWidth: typeof result.imageWidth === 'number' ? result.imageWidth : undefined,
    imageHeight: typeof result.imageHeight === 'number' ? result.imageHeight : undefined,
  }));

  return [...webResults, ...newsResults, ...imageResults].filter((result) => result.url);
}

function normalizeTranscriptSegments(value: unknown): TranscriptSegment[] {
  return asArray<Record<string, unknown>>(value as Record<string, unknown> | Record<string, unknown>[] | null | undefined)
    .map((segment) => ({
      startMs: toNumber(segment.startMs ?? segment.start ?? 0),
      endMs: toNumber(segment.endMs ?? segment.end ?? 0),
      text: typeof segment.text === 'string' ? sanitizeTranscriptText(segment.text) : '',
      speaker: typeof segment.speaker === 'string' ? segment.speaker.trim() : undefined,
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs))
    .sort((a, b) => a.startMs - b.startMs);
}

function buildAudioFetchHeaders(audioUrl: string) {
  const parsed = new URL(audioUrl);
  return {
    'User-Agent': 'Curio/1.0 (+https://curio.fm)',
    Accept: 'audio/*,*/*;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${parsed.protocol}//${parsed.host}/`,
  };
}

function parsePositiveInt(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function formatBytes(value: number) {
  const megabytes = value / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)}MB`;
}

function safeAudioFilename(audioUrl: string) {
  try {
    const parsed = new URL(audioUrl);
    const fileName = parsed.pathname.split('/').pop() || 'episode.mp3';
    return fileName || 'episode.mp3';
  } catch {
    return 'episode.mp3';
  }
}

function guessAudioContentType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.m4a')) return 'audio/mp4';
  if (normalized.endsWith('.mp4')) return 'audio/mp4';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  if (normalized.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg';
}

function parseVTT(input: string): TranscriptSegment[] {
  const lines = input.replace(/\r/g, '').split('\n');
  const segments: TranscriptSegment[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line === 'WEBVTT') continue;

    if (line.startsWith('NOTE') || line.startsWith('STYLE') || line.startsWith('REGION')) {
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }

    let timingLine = line;
    if (!timingLine.includes('-->')) {
      index += 1;
      timingLine = lines[index]?.trim() || '';
      if (!timingLine.includes('-->')) continue;
    }

    const [startRaw, endRaw] = timingLine.split('-->');
    if (!startRaw || !endRaw) continue;

    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      textLines.push(lines[index].trim());
      index += 1;
    }

    const { text, speaker } = extractCueText(textLines.join(' '));
    if (!text) continue;

    segments.push({
      startMs: parseTimestamp(startRaw),
      endMs: parseTimestamp(endRaw),
      text,
      speaker,
    });
  }

  return segments;
}

function parseSRT(input: string): TranscriptSegment[] {
  const blocks = input
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map<TranscriptSegment | null>((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const timingLine = lines.find((line) => line.includes('-->'));
      if (!timingLine) return null;

      const [startRaw, endRaw] = timingLine.split('-->');
      const textLines = lines.slice(lines.indexOf(timingLine) + 1);
      const { text, speaker } = extractCueText(textLines.join(' '));
      if (!text) return null;

      return {
        startMs: parseTimestamp(startRaw),
        endMs: parseTimestamp(endRaw),
        text,
        ...(speaker ? { speaker } : {}),
      };
    })
    .filter((segment): segment is TranscriptSegment => segment !== null);
}

function extractCueText(rawText: string) {
  const voiceMatch = rawText.match(/^<v(?:\.[^>\s]+)?\s+([^>]+)>([\s\S]*)$/i);
  const cleaned = sanitizeTranscriptText(
    decodeEntities(rawText)
    .replace(/<\/?c(?:\.[^>]+)?>/gi, '')
    .replace(/<\/?i>/gi, '')
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?u>/gi, '')
    .replace(/<\/v>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(),
  );

  if (voiceMatch) {
    return {
      speaker: decodeEntities(voiceMatch[1]).trim(),
      text: cleaned,
    };
  }

  const speakerMatch = cleaned.match(/^([A-Z][\w .'-]{1,40}):\s+(.+)$/);
  if (speakerMatch) {
    return {
      speaker: speakerMatch[1].trim(),
      text: speakerMatch[2].trim(),
    };
  }

  return { text: cleaned, speaker: undefined as string | undefined };
}

function parseTimestamp(input: string) {
  const clean = input.trim().split(/\s+/)[0].replace(',', '.');
  const parts = clean.split(':');
  const normalized = parts.length === 2 ? ['0', ...parts] : parts;
  const [hoursRaw = '0', minutesRaw = '0', secondsRaw = '0'] = normalized;
  const [secondsPart = '0', millisPart = '0'] = secondsRaw.split('.');

  const hours = parseInt(hoursRaw, 10) || 0;
  const minutes = parseInt(minutesRaw, 10) || 0;
  const seconds = parseInt(secondsPart, 10) || 0;
  const milliseconds = parseInt(millisPart.padEnd(3, '0').slice(0, 3), 10) || 0;

  return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}

function parseDuration(input: string | number) {
  if (typeof input === 'number') return input;

  const value = String(input || '');
  if (value.includes(':')) {
    const parts = value.split(':').map((part) => parseInt(part, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }

  return parseInt(value, 10) || 0;
}

function stripHtml(html: string) {
  return decodeEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeEntities(value: string) {
  return decodeHTML(value);
}

function sanitizeTranscriptText(value: string) {
  return value
    .replace(/\[(?:[^[\]]{1,40})\]/g, ' ')
    .replace(/\((?:music|laughter|laughs|applause|inaudible|unintelligible|slow|fast|sighs?)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHostNames(channel: any) {
  const rawCandidates = [
    getText(channel['itunes:author']),
    getText(channel.author),
    getText(channel['dc:creator']),
    extractOwnerName(channel['itunes:owner']),
    extractManagingEditorName(channel.managingEditor),
  ].filter(Boolean);

  const seen = new Set<string>();
  const hostNames: string[] = [];

  for (const candidate of rawCandidates) {
    for (const name of splitPotentialNames(candidate)) {
      const normalized = name.trim();
      if (!normalized || seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      hostNames.push(normalized);
    }
  }

  return hostNames;
}

function extractManagingEditorName(value: unknown) {
  const text = getText(value);
  if (!text) return '';

  const parenMatch = text.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1];

  return text.includes('@') ? '' : text;
}

function extractOwnerName(owner: any) {
  if (!owner) return '';
  return getText(owner['itunes:name']) || getText(owner.name);
}

function splitPotentialNames(value: string) {
  return value
    .split(/\s*(?:,|&| and )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractTranscriptUrl(value: unknown) {
  if (!value) return '';

  for (const item of asArray<unknown>(value)) {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const object = item as Record<string, unknown>;
      if (typeof object['@_url'] === 'string') return object['@_url'].trim();
      if (typeof object.url === 'string') return object.url.trim();
    }
    const text = getText(item);
    if (text) return text;
  }

  return '';
}

function getImageUrl(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value['@_href']) return String(value['@_href']);
  if (value.url) return String(value.url);
  return getText(value);
}

function getText(value: any): string {
  if (typeof value === 'string') return decodeEntities(value).trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    if (typeof value['#text'] === 'string') return decodeEntities(value['#text']).trim();
    if (typeof value['@_href'] === 'string') return decodeEntities(value['@_href']).trim();
    if (typeof value.href === 'string') return decodeEntities(value.href).trim();
  }
  return '';
}

function formatSegmentText(segment: TranscriptSegment) {
  if (!segment.speaker) return segment.text;
  return `${segment.speaker}: ${segment.text}`;
}

function truncateFromEnd(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(value.length - maxLength);
}

async function buildTranscriptKey(feedUrl: string | undefined, episodeId: string) {
  const input = `${feedUrl || ''}::${episodeId}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readTranscriptRecord(kv: KVNamespace, key: string) {
  const raw = await kv.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TranscriptRecord;
  } catch {
    return null;
  }
}

async function putTranscriptRecord(kv: KVNamespace, key: string, record: TranscriptRecord) {
  await kv.put(key, JSON.stringify(record));
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}
