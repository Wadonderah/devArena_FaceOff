'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, Users } from 'lucide-react';
import { CompetitionStateBadge } from '@/components/ui/badge';
import type { CompetitionListItem } from '@/lib/types';

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/// A competition, with enough on it to decide whether to open it.
///
/// The previous dashboard listed a name and a badge, which told a participant
/// nothing about what the competition was or whether they could still join. The
/// API was already returning the description, the participant count and the
/// registration window; all three were being thrown away.
export function CompetitionCard({ competition }: { competition: CompetitionListItem }) {
  const { id, name, description, state, registrationClosesAt, _count } = competition;
  const closes = registrationClosesAt ? new Date(registrationClosesAt) : null;
  const closingSoon = closes !== null && closes.getTime() > Date.now();

  return (
    <Link
      href={`/competitions/${id}`}
      className="group block rounded-xl border border-line bg-surface-1 p-5 transition-colors hover:border-brand/40 hover:bg-surface-2/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="text-lg leading-snug">{name}</h3>
        <CompetitionStateBadge state={state} />
      </div>

      {description && (
        <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-ink-dim">{description}</p>
      )}

      {/* Separated from the copy above by a rule rather than just stacked, so
          the facts read as metadata and not as a continuation of the blurb. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[13px] text-ink-faint">
        {typeof _count?.participants === 'number' && (
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden size={13} strokeWidth={1.5} />
            {_count.participants} {_count.participants === 1 ? 'participant' : 'participants'}
          </span>
        )}

        {closingSoon && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock aria-hidden size={13} strokeWidth={1.5} />
            Registration closes {DATE.format(closes)}
          </span>
        )}

        <span className="ml-auto inline-flex items-center gap-1 text-ink-dim transition-colors group-hover:text-brand-bright">
          Open
          <ArrowRight aria-hidden size={13} strokeWidth={1.75} />
        </span>
      </div>
    </Link>
  );
}

/// Finished and archived competitions, which are worth keeping reachable but
/// not worth a full card each.
export function CompetitionRow({ competition }: { competition: CompetitionListItem }) {
  return (
    <Link
      href={`/competitions/${competition.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-4 py-2.5 transition-colors hover:border-line-bright hover:bg-surface-2"
    >
      <span className="truncate text-[14px]">{competition.name}</span>
      <CompetitionStateBadge state={competition.state} />
    </Link>
  );
}
