import { RoundState } from '@prisma/client';

/// Transitions are one-way past LIVE. A COMPLETED round cannot reopen, because
/// reopening would let submissions land against a round whose scores were already
/// folded into the leaderboard.
const ALLOWED: Record<RoundState, RoundState[]> = {
  [RoundState.DRAFT]: [RoundState.SCHEDULED],
  [RoundState.SCHEDULED]: [RoundState.DRAFT, RoundState.LIVE],
  [RoundState.LIVE]: [RoundState.COMPLETED],
  [RoundState.COMPLETED]: [RoundState.ARCHIVED],
  [RoundState.ARCHIVED]: [],
};

export function canTransition(from: RoundState, to: RoundState): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedTransitions(from: RoundState): RoundState[] {
  return ALLOWED[from];
}
