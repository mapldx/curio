import type { NotionSettings } from '../types';

const STORAGE_KEY = 'curio_notion_settings';

export function getNotionSettings(): NotionSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<NotionSettings> | null;
    if (!parsed?.token || !parsed?.parentPageId) return null;

    return {
      token: parsed.token,
      parentPageId: parsed.parentPageId,
    };
  } catch {
    return null;
  }
}

export function setNotionSettings(token: string, parentPageId: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token,
        parentPageId,
      }),
    );
  } catch {}
}

export function clearNotionSettings(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
