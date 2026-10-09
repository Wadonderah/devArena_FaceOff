'use client';

import { useCallback, useEffect, useRef } from 'react';

const PREFIX = 'faceoff:draft';
const SAVE_DEBOUNCE_MS = 700;

/// Keyed by user as well as challenge: shared machines at a venue are normal,
/// and without the user id the next person inherits the previous one's code.
export function draftKey(userId: string, challengeId: string, language: string): string {
  return `${PREFIX}:${userId}:${challengeId}:${language}`;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, blocked storage, or quota. Never break the editor for it.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* see read() */
  }
}

export function clearDraft(userId: string, challengeId: string, language: string): void {
  try {
    window.localStorage.removeItem(draftKey(userId, challengeId, language));
  } catch {
    /* see read() */
  }
}

/// Keeps editor contents in browser storage so a lost session, crashed tab or
/// flat battery cannot cost a participant their typed code.
///
/// `restore()` seeds the editor; `clear()` runs after an accepted submission so
/// a stale draft cannot reappear over a later one.
export function useDraft(opts: {
  userId: string | undefined;
  challengeId: string | undefined;
  language: string;
  value: string;
  /// Without this the first render writes an empty string over a stored draft.
  ready: boolean;
}): { restore: () => string | null; clear: () => void } {
  const { userId, challengeId, language, value, ready } = opts;
  const key = userId && challengeId ? draftKey(userId, challengeId, language) : null;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key || !ready) return;

    // CodeMirror fires per keystroke and localStorage writes block the thread.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => write(key, value), SAVE_DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value, ready]);

  // Flush the pending debounce on the way out. `pagehide`, not `beforeunload`:
  // it also fires on mobile tab switches and bfcache navigations.
  useEffect(() => {
    if (!key || !ready) return;

    const flush = () => write(key, value);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [key, value, ready]);

  const restore = useCallback(() => (key ? read(key) : null), [key]);
  const clear = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* see read() */
    }
  }, [key]);

  return { restore, clear };
}
