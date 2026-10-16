'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { useMcqProgress, useMyCodeSubmissions } from '@/lib/hooks';
import { ROUND_PATH } from '@/lib/taxonomy';
import type { RoundState, RoundType } from '@/lib/types';
import { cn } from '@/lib/cn';

/// Whether a round can hold any work of yours yet. DRAFT and SCHEDULED cannot,
/// so neither is worth a request — this keeps a three-round page to the one or
/// two queries that can actually return something.
const CAN_HAVE_WORK: RoundState[] = ['LIVE', 'PAUSED', 'COMPLETED', 'FINALIZED', 'ARCHIVED'];

export interface RoundLike {
  id: string;
  type: RoundType;
  state: RoundState;
  _count: { challenges: number };
}

export interface RoundProgress {
  /// Questions answered, or challenges with at least one submission.
  attempted: number;
  total: number;
  started: boolean;
  done: boolean;
  loading: boolean;
}

/// How far through a round you are, whatever kind of round it is.
///
/// MCQ reports answered-of-total directly. Code has no such endpoint, so
/// progress is the number of distinct challenges with a submission against
/// them — a challenge submitted twice is still one challenge attempted.
export function useRoundProgress(round: RoundLike): RoundProgress {
  const relevant = CAN_HAVE_WORK.includes(round.state);
  const isMcq = round.type === 'MCQ';

  const mcq = useMcqProgress(relevant && isMcq ? round.id : '');
  const code = useMyCodeSubmissions(relevant && !isMcq ? round.id : '');

  if (!relevant) {
    return { attempted: 0, total: round._count.challenges, started: false, done: false, loading: false };
  }

  if (isMcq) {
    const total = mcq.data?.totalQuestions ?? round._count.challenges;
    const attempted = mcq.data?.answeredCount ?? 0;
    return {
      attempted,
      total,
      started: attempted > 0,
      done: total > 0 && attempted >= total,
      loading: mcq.isLoading,
    };
  }

  const attempted = new Set((code.data ?? []).map((s) => s.challengeId)).size;
  const total = round._count.challenges;
  return {
    attempted,
    total,
    started: attempted > 0,
    done: total > 0 && attempted >= total,
    loading: code.isLoading,
  };
}

/// What to show on a round row: how far you got, or a way in.
///
/// Offering "Enter" to someone who has already answered every question reads as
/// though their work did not register. The state they are in is the more useful
/// thing to show, and it is the thing the page already knows.
export function RoundProgressAction({
  round,
  canEnter,
}: {
  round: RoundLike;
  canEnter: boolean;
}) {
  const { attempted, total, started, done, loading } = useRoundProgress(round);

  if (loading) return null;

  if (done) {
    const current = round.state === 'LIVE';
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-control border px-2.5 py-1 text-[12px]',
          current
            ? 'border-brand/30 bg-brand/10 font-medium text-brand'
            : 'border-line bg-surface-2 text-ink-dim',
        )}
      >
        <Check aria-hidden size={13} strokeWidth={2.5} />
        {current ? 'Submitted' : 'Completed'}
      </span>
    );
  }

  if (started) {
    const label = (
      <span className="font-mono tabular-nums">
        {attempted}/{total}
      </span>
    );

    // Part-way through a round that is still open: say where they are, and give
    // them the way back in on the same control.
    if (canEnter) {
      return (
        <Link href={`/rounds/${round.id}/${ROUND_PATH[round.type]}`} className="shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-control border border-brand/30 bg-brand/10 px-2.5 py-1 text-[12px] font-medium text-brand">
            {label}
            Resume
            <ArrowRight aria-hidden size={13} strokeWidth={2} />
          </span>
        </Link>
      );
    }

    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-ink-dim">
        {label}
        attempted
      </span>
    );
  }

  if (canEnter) {
    return (
      <Link href={`/rounds/${round.id}/${ROUND_PATH[round.type]}`} className="shrink-0">
        <span className="inline-flex items-center gap-1 rounded-control border border-live/30 bg-live/10 px-2.5 py-1 text-[12px] font-medium text-live">
          Enter
          <ArrowRight aria-hidden size={13} strokeWidth={2} />
        </span>
      </Link>
    );
  }

  return null;
}
