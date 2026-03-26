import type { Episode, TranscriptSegment } from '../types';

const PREVIOUS_SEGMENT_WINDOW_MS = 15000;
const NEXT_SEGMENT_WINDOW_MS = 10000;
const MAX_CONTEXT_TEXT_LENGTH = 260;
const MAX_FALLBACK_LENGTH = 100;
const SAME_SPEAKER_GAP_MS = 1200;

export interface CurrentMomentViewModel {
  mode: 'transcript' | 'fallback';
  label: string;
  text: string;
  meta: string | null;
  scrollProgress: number;
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function mapSpeakerName(speaker: string | undefined, hostNames?: string[]) {
  if (!speaker) return null;
  if (!hostNames?.length) return speaker;

  const normalized = speaker.trim();
  const numericMatch = normalized.match(/^speaker[_\s-]*(\d+)$/i);
  if (!numericMatch) return normalized;

  const parsed = Number(numericMatch[1]);
  if (Number.isNaN(parsed)) return normalized;

  const zeroBasedHost = hostNames[parsed];
  if (zeroBasedHost) return zeroBasedHost;

  const oneBasedHost = hostNames[parsed - 1];
  return oneBasedHost || normalized;
}

function chunkText(value: string, maxLength: number) {
  const compact = compactWhitespace(value);
  if (compact.length <= maxLength) return compact;

  const sentences = compact.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) || [compact];
  let chunk = '';

  for (const sentence of sentences) {
    if (!chunk) {
      if (sentence.length <= maxLength) {
        chunk = sentence;
        continue;
      }

      const sliced = sentence.slice(0, maxLength);
      const lastSpace = sliced.lastIndexOf(' ');
      return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim();
    }

    const next = `${chunk} ${sentence}`.trim();
    if (next.length > maxLength) break;
    chunk = next;
  }

  return chunk || compact.slice(0, maxLength).trim();
}

function buildFallbackMoment(episode: Episode): CurrentMomentViewModel {
  const fallbackText = chunkText(
    episode.description || 'Curio can explain the exact moment you are hearing now.',
    MAX_FALLBACK_LENGTH,
  );

  return {
    mode: 'fallback',
    label: 'Episode context',
    text: fallbackText,
    meta: 'Transcript pending',
    scrollProgress: 0,
  };
}

function findSegmentIndex(segments: TranscriptSegment[], positionMs: number) {
  const containingIndex = segments.findIndex(
    (segment) => segment.startMs <= positionMs && segment.endMs >= positionMs,
  );
  if (containingIndex >= 0) return containingIndex;

  const nextIndex = segments.findIndex((segment) => segment.startMs > positionMs);
  if (nextIndex >= 0 && segments[nextIndex].startMs - positionMs <= NEXT_SEGMENT_WINDOW_MS) {
    return nextIndex;
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (positionMs >= segment.endMs && positionMs - segment.endMs <= PREVIOUS_SEGMENT_WINDOW_MS) {
      return index;
    }
  }

  return -1;
}

function combineSegments(segments: TranscriptSegment[], anchorIndex: number) {
  const anchor = segments[anchorIndex];
  if (!anchor) return [];

  const combined: TranscriptSegment[] = [anchor];
  let totalLength = compactWhitespace(anchor.text).length;

  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    const first = combined[0];
    if (candidate.speaker !== first.speaker) break;
    if (first.startMs - candidate.endMs > SAME_SPEAKER_GAP_MS) break;

    const candidateText = compactWhitespace(candidate.text);
    if (totalLength + 1 + candidateText.length > MAX_CONTEXT_TEXT_LENGTH) break;

    combined.unshift(candidate);
    totalLength += 1 + candidateText.length;
  }

  for (let index = anchorIndex + 1; index < segments.length; index += 1) {
    const candidate = segments[index];
    const last = combined[combined.length - 1];
    if (candidate.speaker !== last.speaker) break;
    if (candidate.startMs - last.endMs > SAME_SPEAKER_GAP_MS) break;

    const candidateText = compactWhitespace(candidate.text);
    if (totalLength + 1 + candidateText.length > MAX_CONTEXT_TEXT_LENGTH) break;

    combined.push(candidate);
    totalLength += 1 + candidateText.length;
  }

  return combined;
}

export function deriveCurrentMoment(
  episode: Episode,
  segments: TranscriptSegment[] | undefined,
  positionMs: number,
): CurrentMomentViewModel {
  if (!segments?.length) {
    return buildFallbackMoment(episode);
  }

  const anchorIndex = findSegmentIndex(segments, positionMs);
  if (anchorIndex < 0) {
    return buildFallbackMoment(episode);
  }

  const displaySegments = combineSegments(segments, anchorIndex);
  if (!displaySegments.length) {
    return buildFallbackMoment(episode);
  }

  const text = displaySegments.map((segment) => compactWhitespace(segment.text)).join(' ');
  const firstSegment = displaySegments[0];
  const lastSegment = displaySegments[displaySegments.length - 1];
  const speakerName = mapSpeakerName(firstSegment.speaker, episode.hostNames);
  const rangeStart = firstSegment.startMs;
  const rangeEnd = lastSegment?.endMs || firstSegment.endMs;
  const scrollProgress = Math.min(1, Math.max(0, (positionMs - rangeStart) / Math.max(1, rangeEnd - rangeStart)));

  return {
    mode: 'transcript',
    label: 'Current moment',
    text,
    meta: speakerName || null,
    scrollProgress,
  };
}
