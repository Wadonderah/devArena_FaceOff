import { RoundState } from '@prisma/client';
import { allowedTransitions, canTransition } from './round-state';

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

  it('refuses a no-op transition to the same state', () => {
    for (const state of Object.values(RoundState)) {
      expect(canTransition(state, state)).toBe(false);
    }
  });
});
