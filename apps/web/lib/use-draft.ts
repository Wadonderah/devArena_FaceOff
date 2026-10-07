'use client';

import { useCallback, useEffect, useRef } from 'react';

const PREFIX = 'faceoff:draft';
const SAVE_DEBOUNCE_MS = 700;

/// Where one participant's work on one challenge in one language lives.
///
/// Keyed by user as well as challenge because a shared machine at a venue is
/// normal — without the user id, the next person to sign in would inherit the
/// previous one's code.
export function draftKey(userId: string, challengeId: string, language: string): string {
  return `${PREFIX}:${userId}:${challengeId}:${language}`;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, blocked site data, or a quota error. A draft is a
    // convenience; failing to read one must never break the editor.
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

/// Keeps an editor's contents in browser storage so a lost session cannot cost
/// a participant their work.
///
/// This exists because of a real incident: an expired access cookie signed
/// someone out mid-Code-Sprint. The session bug itself is fixed, but a forced
/// sign-in must never destroy typed code regardless of why it happened — a
/// crashed tab, a closed laptop, or a flat battery all have the same cost.
///
/// Returns `restore()`, which the caller uses to seed its editor state, and
/// `clear()`, which it calls after a submission is accepted so a stale draft
/// does not reappear over a later one.
export function useDraft(opts: {
  userId: string | undefined;
  challengeId: string | undefined;
  language: string;
  value: string;
  /// Suppresses saving until the editor has been seeded. Without it the first
  /// render writes an empty string over a stored draft before restore runs.
  ready: boolean;
}): { restore: () => string | null; clear: () => void } {
  const { userId, challengeId, language, value, ready } = opts;
  const key = userId && challengeId ? draftKey(userId, challengeId, language) : null;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key || !ready) return;

    // Debounced: CodeMirror fires on every keystroke, and localStorage writes
    // are synchronous and block the main thread.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => write(key, value), SAVE_DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value, ready]);

  // A pending debounce would be lost if the tab closes first, so flush on the
  // way out. `pagehide` rather than `beforeunload`: it fires on mobile tab
  // switches and bfcache navigations, which `beforeunload` does not.
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
