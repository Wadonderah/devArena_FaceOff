'use client';

import Link from 'next/link';
import { ArrowLeft, Flag, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RoundState } from '@/lib/types';

/// A round that is no longer taking submissions.
///
/// Mirrors `hasClosed()` in apps/api/src/rounds/round-state.ts. PAUSED is
/// deliberately absent: it is not closed, it is coming back, and telling
/// someone their round has ended when the organizer is about to resume it
/// would be worse than saying nothing.
export function isRoundClosed(state: RoundState): boolean {
  return state === 'COMPLETED' || state === 'FINALIZED' || state === 'ARCHIVED';
}

/// Shown in place of the working area once a round has ended.
///
/// Until now the round simply stopped accepting work and left the participant
/// sitting on the same screen: the badge changed, the editor stayed, and the
/// next submission failed with a permission error. Nobody was told the round
/// was over, and nothing offered a way onward — so the obvious next question,
/// "how did I do", had no answer on the page that raised it.
export function RoundClosed({
  competitionId,
  state,
}: {
  competitionId: string;
  state: RoundState;
}) {
  return (
    <section className="panel hairline p-5 sm:p-8 text-center">
      <div
        aria-hidden
        className="mx-auto grid size-11 place-items-center rounded-full bg-brand/15 text-brand-bright"
      >
        <Flag size={20} strokeWidth={1.5} />
      </div>

      <h2 className="mt-4 text-2xl">This round has ended</h2>

      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-dim">
        {state === 'FINALIZED' || state === 'ARCHIVED'
          ? 'Scores for this round are final and counted towards the standings.'
          : 'No more submissions are being accepted. Scores are still being confirmed, so the standings may shift.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Link href={`/leaderboard/${competitionId}`}>
          <Button icon={<Trophy />}>See the standings</Button>
        </Link>
        <Link href={`/competitions/${competitionId}`}>
          <Button variant="secondary" icon={<ArrowLeft />}>
            Back to the competition
          </Button>
        </Link>
      </div>
    </section>
  );
}

/// Always-available way out of a round, for the participant who has finished
/// everything but whose round is still open. Without it the only exit is the
/// browser's back button.
export function RoundExitLinks({ competitionId }: { competitionId: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-4 sm:pt-5 text-[13px]">
      <Link
        href={`/leaderboard/${competitionId}`}
        className="inline-flex items-center gap-1.5 text-ink-dim underline underline-offset-4 transition-colors hover:text-ink"
      >
        <Trophy aria-hidden size={13} strokeWidth={1.5} />
        Standings
      </Link>
      <Link
        href={`/competitions/${competitionId}`}
        className="inline-flex items-center gap-1.5 text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
      >
        <ArrowLeft aria-hidden size={13} strokeWidth={1.5} />
        Back to the competition
      </Link>
    </div>
  );
}
