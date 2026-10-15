'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarClock, Radio, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompetitionStateBadge, RoundStateBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FaceOffRule } from '@/components/brand-mark';
import { useCompetition } from '@/lib/hooks';
import { ROUND_PATH } from '@/lib/taxonomy';
import type { CompetitionListItem } from '@/lib/types';
import { cn } from '@/lib/cn';

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const ADVANCE_MS = 7000;
const SWIPE_THRESHOLD_PX = 44;

/// The round strip, filled in for whichever slide is showing.
///
/// Only the active slide's detail is requested, so a participant with six open
/// competitions still costs one `/competitions/:id` call rather than six. React
/// Query keeps what it has already fetched, so sliding back is instant.
function RoundStrip({
  competitionId,
  active,
  isLive,
}: {
  competitionId: string;
  active: boolean;
  isLive: boolean;
}) {
  const { data } = useCompetition(active ? competitionId : '');

  const live = data?.rounds.find((r) => r.state === 'LIVE');
  const next = data?.rounds.find((r) => r.state === 'SCHEDULED');
  const focus = live ?? next;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-4 py-3.5 sm:px-6 sm:py-4',
        isLive ? 'border-live/20 bg-live/[0.04]' : 'border-line bg-surface-2/30',
      )}
    >
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          {isLive ? (
            <Radio aria-hidden size={13} strokeWidth={1.75} className="text-live" />
          ) : (
            <CalendarClock aria-hidden size={13} strokeWidth={1.5} />
          )}
          {!data ? 'Rounds' : live ? 'Happening now' : next ? 'Up next' : 'Rounds'}
        </p>

        {!data ? (
          <Skeleton className="mt-2 h-[1.15rem] w-48 rounded" />
        ) : focus ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="text-[15px] font-medium text-ink">{focus.name}</h3>
            <RoundStateBadge state={focus.state} />
            <span className="text-[13px] text-ink-faint">
              {focus._count.challenges} {focus.type === 'MCQ' ? 'questions' : 'problems'}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-[14px] text-ink-dim">No rounds are open right now.</p>
        )}
      </div>

      {focus?.state === 'LIVE' && data?.joined && (
        <Link href={`/rounds/${focus.id}/${ROUND_PATH[focus.type]}`} className="w-full sm:w-auto">
          <Button icon={<ArrowRight />} className="w-full">
            Enter round
          </Button>
        </Link>
      )}
    </div>
  );
}

function Slide({
  competition,
  active,
}: {
  competition: CompetitionListItem;
  active: boolean;
}) {
  const isLive = competition.state === 'LIVE';
  const closes = competition.registrationClosesAt
    ? new Date(competition.registrationClosesAt)
    : null;

  return (
    <article
      // Inert to the keyboard and to screen readers while off-screen, so tabbing
      // does not travel through three hidden slides to reach the page below.
      aria-hidden={!active}
      inert={!active}
      className="w-full shrink-0"
    >
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-surface-1',
          isLive ? 'border-live/25' : 'border-line',
        )}
      >
        <FaceOffRule live={isLive} />

        {/* The tint is the whole reason this reads as "featured" rather than as
            another card: a wash that fades out before the round strip, so the
            two halves stay distinct without a second border. */}
        <div
          className={cn(
            'bg-gradient-to-br',
            isLive ? 'from-live/[0.08] via-transparent to-transparent' : 'from-brand/[0.08] via-transparent to-transparent',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5 p-4 sm:gap-y-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h2 className="text-2xl leading-tight">{competition.name}</h2>
                <CompetitionStateBadge state={competition.state} />
              </div>

              {competition.description && (
                <p className="mt-2 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-ink-dim sm:line-clamp-none sm:text-[14px]">
                  {competition.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-faint">
                {typeof competition._count?.participants === 'number' && (
                  <span className="inline-flex items-center gap-1.5">
                    <Users aria-hidden size={13} strokeWidth={1.5} />
                    <span className="tabular-nums">{competition._count.participants}</span>
                    <span>{competition._count.participants === 1 ? 'entrant' : 'entrants'}</span>
                  </span>
                )}
                {closes && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock aria-hidden size={13} strokeWidth={1.5} />
                    Registration closes {DATE.format(closes)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex w-full shrink-0 gap-2 sm:w-auto">
              <Link href={`/leaderboard/${competition.id}`} className="flex-1 sm:flex-none">
                <Button variant="secondary" size="sm" className="w-full">
                  Standings
                </Button>
              </Link>
              <Link href={`/competitions/${competition.id}`} className="flex-1 sm:flex-none">
                <Button variant="secondary" size="sm" icon={<ArrowRight />} className="w-full">
                  Open
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <RoundStrip competitionId={competition.id} active={active} isLive={isLive} />
      </div>
    </article>
  );
}

/// The competitions a participant can act on, one at a time.
///
/// A dashboard with three open seasons used to stack three full panels and push
/// everything else past the fold. Showing one and letting the rest cycle keeps
/// the page one screen tall whether there is one competition or six.
///
/// With a single competition this renders as a plain panel: no dots, no timer,
/// no swipe. A carousel of one is just a card with extra machinery.
export function CompetitionCarousel({
  competitions,
  onActiveChange,
}: {
  competitions: CompetitionListItem[];
  onActiveChange?: (competition: CompetitionListItem) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const touchStartX = useRef<number | null>(null);

  const count = competitions.length;
  const many = count > 1;

  // A competition finishing mid-session shortens the list; without this the
  // track would sit translated past its own end, showing nothing.
  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  const active = competitions[Math.min(index, count - 1)];

  useEffect(() => {
    if (active) onActiveChange?.(active);
  }, [active, onActiveChange]);

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Autoplay stops for reduced motion, for a single slide, and while the
  // participant is reading this one — hovering, focusing or mid-swipe.
  useEffect(() => {
    if (!many || paused || reduceMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [many, paused, reduceMotion, count]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription={many ? 'carousel' : undefined}
      aria-label={many ? 'Competitions you can enter' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      }}
      onTouchStart={(e) => {
        setPaused(true);
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        setPaused(false);
        const from = touchStartX.current;
        touchStartX.current = null;
        if (from === null || !many) return;
        const dx = e.changedTouches[0].clientX - from;
        if (Math.abs(dx) > SWIPE_THRESHOLD_PX) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {/* overflow-hidden clips the off-screen slides; the track itself is the
          only thing that moves. */}
      <div className="overflow-hidden">
        <div
          className={cn(
            'flex',
            reduceMotion ? '' : 'transition-transform duration-500 ease-out-expo',
          )}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {competitions.map((c, i) => (
            <Slide key={c.id} competition={c} active={i === index} />
          ))}
        </div>
      </div>

      {many && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {competitions.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${c.name}`}
              aria-current={i === index}
              // Hit area stays 24px while the dot itself is 6px, so this is
              // thumb-reachable without drawing a row of large circles.
              className="group grid size-6 place-items-center"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-all duration-300',
                  i === index ? 'w-5 bg-brand' : 'w-1.5 bg-line-bright group-hover:bg-ink-faint',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
