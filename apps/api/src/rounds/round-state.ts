import { RoundState } from '@prisma/client';

/// Transitions are one-way past LIVE. A COMPLETED round cannot reopen, because
/// reopening would let submissions land against a round whose scores were already
/// folded into the leaderboard.
const ALLOWED: Record<RoundState, RoundState[]> = {
  [RoundState.DRAFT]: [RoundState.SCHEDULED],
  [RoundState.SCHEDULED]: [RoundState.DRAFT, RoundState.LIVE],

  // PAUSED is reversible: a fire alarm should not end a round.
  [RoundState.LIVE]: [RoundState.PAUSED, RoundState.COMPLETED],
  [RoundState.PAUSED]: [RoundState.LIVE, RoundState.COMPLETED],

  // FINALIZED locks the scores, and may step back to COMPLETED so a published
  // mistake can be corrected. That is NOT a route back to LIVE — unlocking
  // reopens scoring, never submissions, so nobody can add work after seeing
  // the standings.
  [RoundState.COMPLETED]: [RoundState.FINALIZED, RoundState.ARCHIVED],
  [RoundState.FINALIZED]: [RoundState.COMPLETED, RoundState.ARCHIVED],
  [RoundState.ARCHIVED]: [],
};

/// PAUSED is not accepting submissions, but is not closed either; the two must
/// be reported differently.
export function acceptsSubmissions(state: RoundState): boolean {
  return state === RoundState.LIVE;
}

/// Once finalized, no score may change.
export function scoresAreLocked(state: RoundState): boolean {
  return state === RoundState.FINALIZED || state === RoundState.ARCHIVED;
}

/// A round whose answers may be shown: ended and will not reopen. Named so the
/// three "is it over" states stay in one place rather than being listed by hand.
export function hasClosed(state: RoundState): boolean {
  return (
    state === RoundState.COMPLETED ||
    state === RoundState.FINALIZED ||
    state === RoundState.ARCHIVED
  );
}

export function canTransition(from: RoundState, to: RoundState): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedTransitions(from: RoundState): RoundState[] {
  return ALLOWED[from];
}
