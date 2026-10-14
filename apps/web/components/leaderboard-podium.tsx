'use client';

import { Crown } from 'lucide-react';
import { formatScore } from '@/lib/score-format';
import { cn } from '@/lib/cn';

export interface PodiumEntry {
  id: string;
  rank: number;
  name: string;
  score: number;
  /// A second line — elapsed time, or a member count for a team.
  detail?: string;
  isMe?: boolean;
}

/// Per-place styling, keyed by rank.
///
/// Written out rather than computed so each place can differ in more than one
/// dimension — a medal is not just a hue, it is also how much of the card it is
/// allowed to colour.
const PLACE = {
  1: {
    ring: 'ring-medal-gold/55',
    text: 'text-medal-gold',
    tint: 'bg-medal-gold/[0.07]',
    glow: 'shadow-[0_0_34px_-12px_var(--color-medal-gold)]',
  },
  2: {
    ring: 'ring-medal-silver/45',
    text: 'text-medal-silver',
    tint: 'bg-medal-silver/[0.05]',
    glow: '',
  },
  3: {
    ring: 'ring-medal-bronze/45',
    text: 'text-medal-bronze',
    tint: 'bg-medal-bronze/[0.05]',
    glow: '',
  },
} as const;

/// Visual order, not ranking order: second, first, third.
///
/// This is the one convention every physical podium and every game leaderboard
/// shares, and it is load-bearing — centring the winner is what makes the shape
/// readable at a glance without anyone reading a number. Rendering 1, 2, 3
/// left-to-right would be a list with bigger text.
const ARRANGEMENT = [2, 1, 3] as const;

function Card({ entry }: { entry: PodiumEntry }) {
  const place = PLACE[entry.rank as 1 | 2 | 3];
  const first = entry.rank === 1;
  const initial = entry.name.charAt(0).toUpperCase() || '?';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center rounded-xl border border-line text-center',
        // The winner stands taller. On a phone the lift is smaller, because at
        // 390px a 24px offset starts to crop the crown.
        // At 390px the three cards share about 358px, so roughly 114px each.
        // Every fixed size below is set for that first and relaxed upward.
        first ? 'px-2 pb-3 pt-6 sm:-mt-3 sm:px-3 sm:pb-4 sm:pt-8' : 'px-2 pb-3 pt-5 sm:px-3 sm:pb-4 sm:pt-6',
        place.tint,
        entry.isMe && 'border-brand/45',
      )}
    >
      {first && (
        <Crown
          aria-hidden
          size={16}
          strokeWidth={1.75}
          className="absolute -top-2 text-medal-gold"
        />
      )}

      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-full bg-surface-2 font-semibold ring-2',
          place.ring,
          place.glow,
          first
            ? 'size-12 text-[17px] sm:size-16 sm:text-[22px]'
            : 'size-10 text-[14px] sm:size-11 sm:text-[16px]',
        )}
      >
        {initial}
      </span>

      {/* The rank as a numeral too. The arrangement and the metals carry it for
          anyone who knows the convention; this is for everyone who does not,
          and it is what a screen reader reads. */}
      <span className={cn('mt-2 font-display text-[12px] font-semibold sm:text-[13px]', place.text)}>
        {entry.rank === 1 ? '1st' : entry.rank === 2 ? '2nd' : '3rd'}
      </span>

      <span
        className={cn(
          'mt-0.5 w-full truncate px-0.5 text-[12px] sm:px-1 sm:text-[13px]',
          entry.isMe ? 'font-medium text-ink' : 'text-ink-dim',
        )}
        title={entry.name}
      >
        {entry.name}
      </span>

      <span
        className={cn(
          'mt-1 font-display font-semibold tabular-nums',
          first ? 'text-lg sm:text-xl' : 'text-[15px] sm:text-lg',
        )}
      >
        {formatScore(entry.score)}
      </span>

      {/* Hidden on a phone. At 114px wide the card has room for a name, a
          place and a score; a fourth line of 11px metadata is the first thing
          that should go. */}
      {entry.detail && (
        <span className="mt-0.5 hidden text-[11px] tabular-nums text-ink-faint sm:block">
          {entry.detail}
        </span>
      )}

      {entry.isMe && (
        <span className="mt-1.5 rounded-full bg-brand/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-bright">
          You
        </span>
      )}
    </div>
  );
}

/// The top three, as a podium.
///
/// A ranked table answers "what is the order". It does not say "this is a
/// contest" — every row gets identical treatment, so the difference between
/// first and fortieth is a numeral in the left column. That is why the board
/// read as boring: nothing on it was celebrating anything.
///
/// Renders nothing below three entries, where a podium with gaps in it looks
/// broken rather than sparse. The full table underneath still lists everyone,
/// including these three, so the ranking stays complete and scannable in one
/// place.
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  const top = entries.filter((entry) => entry.rank <= 3);
  if (top.length < 3) return null;

  const byRank = new Map(top.map((entry) => [entry.rank, entry]));

  return (
    <section aria-label="Top three" className="mb-5">
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
        {ARRANGEMENT.map((rank) => {
          const entry = byRank.get(rank);
          return entry ? <Card key={rank} entry={entry} /> : <div key={rank} />;
        })}
      </div>
    </section>
  );
}
