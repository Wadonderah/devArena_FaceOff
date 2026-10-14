import { RoundState } from '@prisma/client';
import {
  acceptsSubmissions,
  allowedTransitions,
  canTransition,
  scoresAreLocked,
} from './round-state';

describe('round state machine', () => {
  it('moves a draft round forward to scheduled', () => {
    expect(canTransition(RoundState.DRAFT, RoundState.SCHEDULED)).toBe(true);
  });

  it('lets a scheduled round go back to draft for further editing', () => {
    expect(canTransition(RoundState.SCHEDULED, RoundState.DRAFT)).toBe(true);
  });

  it('starts a scheduled round', () => {
    expect(canTransition(RoundState.SCHEDULED, RoundState.LIVE)).toBe(true);
  });

  it('refuses to take a draft round live without scheduling it', () => {
    expect(canTransition(RoundState.DRAFT, RoundState.LIVE)).toBe(false);
  });

  it('ends a live round', () => {
    expect(canTransition(RoundState.LIVE, RoundState.COMPLETED)).toBe(true);
  });

  it('refuses to reopen a completed round', () => {
    expect(canTransition(RoundState.COMPLETED, RoundState.LIVE)).toBe(false);
    expect(canTransition(RoundState.COMPLETED, RoundState.SCHEDULED)).toBe(false);
    expect(canTransition(RoundState.COMPLETED, RoundState.DRAFT)).toBe(false);
  });

  it('refuses to revive an archived round', () => {
    expect(allowedTransitions(RoundState.ARCHIVED)).toEqual([]);
  });

  it('refuses to skip straight from live to archived', () => {
    expect(canTransition(RoundState.LIVE, RoundState.ARCHIVED)).toBe(false);
  });

  describe('pause and finalize', () => {
    it('pauses a live round and resumes it', () => {
      // Reversible on purpose: a projector failure or a fire alarm must not end
      // a round that people are midway through.
      expect(canTransition(RoundState.LIVE, RoundState.PAUSED)).toBe(true);
      expect(canTransition(RoundState.PAUSED, RoundState.LIVE)).toBe(true);
    });

    it('can end a round directly from paused', () => {
      expect(canTransition(RoundState.PAUSED, RoundState.COMPLETED)).toBe(true);
    });

    it('refuses to pause a round that is not live', () => {
      expect(canTransition(RoundState.SCHEDULED, RoundState.PAUSED)).toBe(false);
      expect(canTransition(RoundState.COMPLETED, RoundState.PAUSED)).toBe(false);
    });

    it('finalizes a completed round', () => {
      expect(canTransition(RoundState.COMPLETED, RoundState.FINALIZED)).toBe(true);
    });

    it('refuses to finalize a round that is still running', () => {
      expect(canTransition(RoundState.LIVE, RoundState.FINALIZED)).toBe(false);
      expect(canTransition(RoundState.PAUSED, RoundState.FINALIZED)).toBe(false);
    });

    it('lets a finalized round be unlocked for correction', () => {
      expect(allowedTransitions(RoundState.FINALIZED)).toEqual([
        RoundState.COMPLETED,
        RoundState.ARCHIVED,
      ]);
    });

    // The point of the unlock is to reopen SCORING, never submissions. These two
    // assertions together are what make that true, and they are the reason the
    // transition is safe to allow at all: a round stepped back to COMPLETED is
    // still closed to participants.
    it('never returns a finalized round to a state that accepts work', () => {
      expect(canTransition(RoundState.FINALIZED, RoundState.LIVE)).toBe(false);
      expect(canTransition(RoundState.FINALIZED, RoundState.PAUSED)).toBe(false);
      expect(canTransition(RoundState.FINALIZED, RoundState.SCHEDULED)).toBe(false);
      expect(canTransition(RoundState.FINALIZED, RoundState.DRAFT)).toBe(false);
    });

    it('leaves an unlocked round closed to submissions', () => {
      expect(canTransition(RoundState.FINALIZED, RoundState.COMPLETED)).toBe(true);
      expect(acceptsSubmissions(RoundState.COMPLETED)).toBe(false);
    });
  });

  describe('submission and score gates', () => {
    it('accepts submissions only while live', () => {
      expect(acceptsSubmissions(RoundState.LIVE)).toBe(true);
      for (const state of [
        RoundState.DRAFT,
        RoundState.SCHEDULED,
        RoundState.PAUSED,
        RoundState.COMPLETED,
        RoundState.FINALIZED,
        RoundState.ARCHIVED,
      ]) {
        expect(acceptsSubmissions(state)).toBe(false);
      }
    });

    it('locks scores once finalized or archived, and not before', () => {
      expect(scoresAreLocked(RoundState.FINALIZED)).toBe(true);
      expect(scoresAreLocked(RoundState.ARCHIVED)).toBe(true);
      // COMPLETED must stay unlocked: a coding submission can still be judged
      // after the clock stops, and that result belongs in the standings.
      expect(scoresAreLocked(RoundState.COMPLETED)).toBe(false);
      expect(scoresAreLocked(RoundState.LIVE)).toBe(false);
    });
  });

  it('refuses a no-op transition to the same state', () => {
    for (const state of Object.values(RoundState)) {
      expect(canTransition(state, state)).toBe(false);
    }
  });
});
