export interface Podcast {
  id: string;
  name: string;
  author: string;
  artworkUrl: string;
  feedUrl: string;
  genre: string;
  episodeCount?: number;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface Episode {
  id: string;
  title: string;
  description: string;
  enclosureUrl: string;
  duration: number;
  pubDate: string;
  link: string;
  imageUrl?: string;
  podcastName?: string;
  genre?: string;
  transcriptUrl?: string;
  feedUrl?: string;
  hostNames?: string[];
}

export interface TranscriptState {
  status: 'pending' | 'ready' | 'failed';
  episodeId: string;
  segments?: TranscriptSegment[];
  error?: string | null;
  updatedAt?: number;
}

export interface EpisodeContextBundle {
  recentSegments: TranscriptSegment[];
  episodeSummary: string;
  showNotes: string | null;
  episodeSummaryFromWeb?: string | null;
  transcriptStatus?: 'pending' | 'ready' | 'failed';
}

export interface FirecrawlSearchParams {
  query: string;
  sources?: string[];
  categories?: string[];
  tbs?: string;
  location?: string;
}

export interface FirecrawlSearchResult {
  title: string;
  url: string;
  content?: string;
  date?: string;
  links?: string[];
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface FirecrawlSearchResponse {
  results: FirecrawlSearchResult[];
  warning?: string | null;
}

export interface NotionSettings {
  token: string;
  parentPageId: string;
}

export interface NotionSaveParams {
  notionToken: string;
  parentPageId: string;
  episodeId: string;
  feedUrl?: string;
  episodeTitle: string;
  podcastName?: string;
  momentTime: string;
  question: string;
  answer: string;
  sources: Source[];
}

export interface NotionStatusParams {
  notionToken: string;
  parentPageId: string;
  episodeId: string;
  feedUrl?: string;
  episodeTitle: string;
}

export interface NotionSaveResponse {
  pageUrl: string;
  isNew: boolean;
  pageTitle: string;
}

export interface NotionStatusResponse {
  exists: boolean;
  pageUrl: string | null;
  pageTitle: string | null;
}

export type DiscoverTopic =
  | 'Trending'
  | 'Science'
  | 'Technology'
  | 'Business'
  | 'History';

export type Screen =
  | 'discover'
  | 'listening'
  | 'interrupted';

export interface AppState {
  screen: Screen;
  podcasts: Podcast[];
  discoverEpisodes: Episode[];
  currentEpisode: Episode | null;
  transcript: TranscriptState | null;
  skippedEpisodeIds: string[];
  discoverTopic: DiscoverTopic;
  libraryVisible: boolean;
  libraryPodcast: Podcast | null;
}

export type AppAction =
  | { type: 'SET_PODCASTS'; podcasts: Podcast[] }
  | { type: 'SET_DISCOVER_EPISODES'; episodes: Episode[] }
  | { type: 'SET_DISCOVER_TOPIC'; topic: DiscoverTopic }
  | { type: 'PLAY_EPISODE'; episode: Episode }
  | { type: 'SET_CONTEXT'; episodeId: string; transcript: TranscriptState | null }
  | { type: 'INTERRUPT' }
  | { type: 'RESUME' }
  | { type: 'MINIMIZE_PLAYER' }
  | { type: 'OPEN_PLAYER' }
  | { type: 'END_EPISODE' }
  | { type: 'OPEN_LIBRARY'; podcast?: Podcast }
  | { type: 'CLOSE_LIBRARY' }
  | { type: 'SKIP_EPISODE'; episodeId: string };

export interface TranscriptEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

export interface Source {
  url: string;
  title: string;
  date?: string;
  imageUrl?: string;
}
