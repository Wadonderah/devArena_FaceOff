'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Check, Circle, Clock, X } from 'lucide-react';
import { Podium, type PodiumEntry } from '@/components/leaderboard-podium';
import { formatScore } from '@/lib/score-format';
import { cn } from '@/lib/cn';

const CYCLE_MS = 6000;

/// Built from the product's own tokens rather than from screenshots.
///
/// A screenshot of a competition platform is out of date the moment any colour
/// changes, cannot follow the theme toggle, and would either leak real
/// participants' names or show obviously fake ones at full resolution. These
/// panels use the same surfaces, type and spacing as the real screens, so they
/// stay honest for free and cost no image bytes.
const VIEWS = [
  { id: 'mcq', label: 'Knowledge Arena' },
  { id: 'code', label: 'Code Sprint' },
  { id: 'board', label: 'Standings' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function Chrome({ children, path }: { children: React.ReactNode; path: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-3 py-2">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line-bright" />
          <span className="size-2.5 rounded-full bg-line-bright" />
          <span className="size-2.5 rounded-full bg-line-bright" />
        </span>
        <span className="mx-auto truncate rounded-full border border-line bg-surface-1 px-3 py-0.5 font-mono text-[10px] text-ink-faint">
          {path}
        </span>
      </div>
      {/* Fixed height so switching views never resizes the frame and shifts the
          page under the reader. */}
      <div className="h-[330px] overflow-hidden sm:h-[360px]">{children}</div>
    </div>
  );
}

function McqView() {
  const options = [
    { key: 'A', text: 'It rebalances the tree on every insert', state: 'idle' },
    { key: 'B', text: 'Lookups stay O(log n) in the worst case', state: 'chosen' },
    { key: 'C', text: 'It requires the keys to be contiguous', state: 'idle' },
    { key: 'D', text: 'Deletion is constant time', state: 'idle' },
  ];

  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Question 3 of 10
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-live">
          <Clock aria-hidden size={11} strokeWidth={2} />
          04:12
        </span>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink sm:text-[15px]">
        Which statement about a balanced binary search tree is correct?
      </p>

      <ul className="mt-3 space-y-2">
        {options.map((o) => (
          <li
            key={o.key}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]',
              o.state === 'chosen'
                ? 'border-brand/50 bg-brand/[0.08] text-ink'
                : 'border-line bg-surface-2/40 text-ink-dim',
            )}
          >
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]',
                o.state === 'chosen'
                  ? 'border-brand bg-brand text-surface-0'
                  : 'border-line-bright text-ink-faint',
              )}
            >
              {o.key}
            </span>
            {o.text}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center gap-1.5 pt-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              i < 2 ? 'bg-brand' : i === 2 ? 'bg-brand/50' : 'bg-line',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function CodeView() {
  const tests = [
    { name: 'handles an empty list', ok: true },
    { name: 'sums positive integers', ok: true },
    { name: 'handles negative values', ok: true },
    { name: 'rejects non-numeric input', ok: false },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="rounded-t border-b-2 border-brand px-2 py-1 font-mono text-[11px] text-ink">
          solution.py
        </span>
        <span className="font-mono text-[11px] text-ink-faint">Python 3</span>
      </div>

      <pre className="flex-1 overflow-hidden px-4 py-3 font-mono text-[11px] leading-[1.7] sm:text-[12px]">
        <code>
          <span className="text-ink-faint">1 </span>
          <span className="text-brand-bright">def</span>
          <span className="text-ink"> total(values):</span>
          {'\n'}
          <span className="text-ink-faint">2 </span>
          <span className="text-ink"> running = </span>
          <span className="text-live-soft">0</span>
          {'\n'}
          <span className="text-ink-faint">3 </span>
          <span className="text-brand-bright"> for</span>
          <span className="text-ink"> v </span>
          <span className="text-brand-bright">in</span>
          <span className="text-ink"> values:</span>
          {'\n'}
          <span className="text-ink-faint">4 </span>
          <span className="text-ink"> running += v</span>
          {'\n'}
          <span className="text-ink-faint">5 </span>
          <span className="text-brand-bright"> return</span>
          <span className="text-ink"> running</span>
        </code>
      </pre>

      <div className="border-t border-line bg-surface-2/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Hidden tests
          </span>
          <span className="font-mono text-[11px] tabular-nums text-ink-dim">3 / 4 passed</span>
        </div>
        <ul className="mt-2 space-y-1">
          {tests.map((t) => (
            <li key={t.name} className="flex items-center gap-2 text-[12px]">
              {t.ok ? (
                <Check aria-hidden size={13} strokeWidth={2.5} className="shrink-0 text-success" />
              ) : (
                <X aria-hidden size={13} strokeWidth={2.5} className="shrink-0 text-danger" />
              )}
              <span className={t.ok ? 'text-ink-dim' : 'text-ink'}>{t.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BoardView() {
  // The real Podium, not a flat list dressed up as one: the landing page should
  // show the component a competitor actually sees at the top of a board.
  const podium: PodiumEntry[] = [
    { id: '1', rank: 1, name: 'Ama Boateng', score: 0.92, detail: '9 solved · 18m' },
    { id: '2', rank: 2, name: 'Kofi Mensah', score: 0.88, detail: '8 solved · 21m' },
    { id: '3', rank: 3, name: 'Yaa Asantewaa', score: 0.81, detail: '8 solved · 26m' },
  ];

  const rest = [
    { rank: 4, name: 'Kwame Nkrumah', score: 0.74 },
    { rank: 5, name: 'Efua Sutherland', score: 0.70 },
  ];

  return (
    <div className="flex h-full flex-col px-4 pt-3 pb-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Season 1 · Standings
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-live">
          <Circle aria-hidden size={7} strokeWidth={0} className="fill-live" />
          Live
        </span>
      </div>

      {/* Scaled down: the podium is built for a full page, and the preview frame
          is a third of that. Transform rather than smaller type, so the
          proportions stay exactly as a competitor sees them. */}
      <div className="mt-2 origin-top scale-[0.82] sm:scale-90">
        <Podium entries={podium} />
      </div>

      <ul className="mt-auto space-y-1">
        {rest.map((r) => (
          <li key={r.rank} className="flex items-center gap-2.5 rounded-lg bg-surface-2/40 px-3 py-1.5">
            <span className="w-4 shrink-0 text-center font-mono text-[11px] tabular-nums text-ink-faint">
              {r.rank}
            </span>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-[9px] text-brand">
              {r.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-dim">{r.name}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
              {formatScore(r.score)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PATHS: Record<ViewId, string> = {
  mcq: 'faceoff.akwannya-hub.org/rounds/knowledge-arena',
  code: 'faceoff.akwannya-hub.org/rounds/code-sprint',
  board: 'faceoff.akwannya-hub.org/leaderboard/season-1',
};

/// A look inside, for people deciding whether to sign up.
export function ProductPreview() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % VIEWS.length), CYCLE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const active = VIEWS[index];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-pressed={i === index}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[12px] transition-colors',
              i === index
                ? 'border-brand/50 bg-brand/10 text-ink'
                : 'border-line bg-surface-1/60 text-ink-dim hover:text-ink',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <Chrome path={PATHS[active.id]}>
          {/* Keyed so React swaps the subtree rather than diffing one view into
              another, which is what makes the fade read as a change of screen. */}
          <div
            key={active.id}
            className={reduceMotion ? 'h-full' : 'h-full animate-fade-in'}
          >
            {active.id === 'mcq' && <McqView />}
            {active.id === 'code' && <CodeView />}
            {active.id === 'board' && <BoardView />}
          </div>
        </Chrome>
      </div>
    </div>
  );
}
