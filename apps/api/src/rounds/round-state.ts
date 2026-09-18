import { RoundState } from '@prisma/client';

/// Transitions are one-way past LIVE. A COMPLETED round cannot reopen, because
/// reopening would let submissions land against a round whose scores were already
/// folded into the leaderboard.
const ALLOWED: Record<RoundState, RoundState[]> = {
  [RoundState.DRAFT]: [RoundState.SCHEDULED],
  [RoundState.SCHEDULED]: [RoundState.DRAFT, RoundState.LIVE],

  // PAUSED is reversible — a projector failing or a fire alarm should not end a
  // round. COMPLETED remains reachable directly for the ordinary case.
  [RoundState.LIVE]: [RoundState.PAUSED, RoundState.COMPLETED],
  [RoundState.PAUSED]: [RoundState.LIVE, RoundState.COMPLETED],

  // FINALIZED locks the scores. Archiving straight from COMPLETED stays possible
  // for rounds nobody needs to certify.
  [RoundState.COMPLETED]: [RoundState.FINALIZED, RoundState.ARCHIVED],
  [RoundState.FINALIZED]: [RoundState.ARCHIVED],
  [RoundState.ARCHIVED]: [],
};

/// A round accepting submissions. PAUSED deliberately is not one — but it is
/// also not closed, and the two must be reported differently.
export function acceptsSubmissions(state: RoundState): boolean {
  return state === RoundState.LIVE;
}

/// Once finalized, no score may change. This is what makes a published result
/// trustworthy rather than merely current.
export function scoresAreLocked(state: RoundState): boolean {
  return state === RoundState.FINALIZED || state === RoundState.ARCHIVED;
}

export function canTransition(from: RoundState, to: RoundState): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedTransitions(from: RoundState): RoundState[] {
  return ALLOWED[from];
}
