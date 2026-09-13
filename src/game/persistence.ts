/**
 * Saved games live in the browser's local storage, keyed by a short game id that also appears in
 * the URL (?game=ID). A game is fully determined by its menu choice (seed, players, options) plus
 * the ordered list of actions taken, so that is all we store; reopening the URL replays it.
 */
import type { Action } from '@/engine/actions';
import type { MenuChoice } from '@/ui/MainMenu';

export interface SavedGame {
  id: string;
  choice: MenuChoice;
  actions: Action[];
  /** Epoch ms of the last save. */
  savedAt: number;
}

const PREFIX = 'natecan:game:';
const URL_PARAM = 'game';

export function newGameId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(id: string, choice: MenuChoice, actions: readonly Action[]): void {
  const s = storage();
  if (!s) return;
  const saved: SavedGame = { id, choice, actions: [...actions], savedAt: Date.now() };
  try {
    s.setItem(PREFIX + id, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the game still plays, it just will not resume.
  }
}

export function loadGame(id: string): SavedGame | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(PREFIX + id);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (!parsed || parsed.id !== id || !Array.isArray(parsed.actions) || !parsed.choice) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteGame(id: string): void {
  storage()?.removeItem(PREFIX + id);
}

/** Every saved game, most recently played first. */
export function listGames(): SavedGame[] {
  const s = storage();
  if (!s) return [];
  const out: SavedGame[] = [];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const g = loadGame(key.slice(PREFIX.length));
    if (g) out.push(g);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function gameIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(URL_PARAM);
}

export function setUrlGameId(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(URL_PARAM, id);
  else url.searchParams.delete(URL_PARAM);
  window.history.replaceState(null, '', url.toString());
}
