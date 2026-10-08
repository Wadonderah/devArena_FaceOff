import { registrationGate } from './registration';
import type { CompetitionState } from './types';

const NOW = new Date('2026-10-08T12:00:00Z').getTime();

const comp = (over: Partial<Parameters<typeof registrationGate>[0]> = {}) => ({
  state: 'REGISTRATION' as CompetitionState,
  registrationOpensAt: null,
  registrationClosesAt: null,
  ...over,
});

describe('registrationGate', () => {
  it('allows joining when there is no window at all', () => {
    expect(registrationGate(comp(), NOW)).toEqual({ joinable: true, detail: null });
  });

  it('allows joining inside the window', () => {
    const gate = registrationGate(
      comp({
        registrationOpensAt: '2026-10-01T00:00:00Z',
        registrationClosesAt: '2026-10-20T00:00:00Z',
      }),
      NOW,
    );

    expect(gate.joinable).toBe(true);
  });

  // The bug this exists for. The competition's state said REGISTRATION and the
  // badge agreed, so the Join button was offered — and every press failed with
  // "Registration has not opened yet" from the server.
  it('refuses a REGISTRATION competition whose window has not opened', () => {
    const gate = registrationGate(
      comp({ registrationOpensAt: '2026-10-15T09:43:00Z' }),
      NOW,
    );

    expect(gate.joinable).toBe(false);
    expect(gate).toMatchObject({ reason: 'not-open' });
  });

  // A participant told only "not opened yet" cannot tell whether to wait five
  // minutes or a week.
  it('names when registration opens', () => {
    const gate = registrationGate(
      comp({ registrationOpensAt: '2026-10-15T09:43:00Z' }),
      NOW,
    );

    expect(gate.detail).toMatch(/Registration opens/);
    // Asserted as separate parts rather than "15 Oct": the order and the clock
    // format come from the reader's own locale, which is the point of using
    // toLocaleDateString at all. Pinning the order here would only assert the
    // test runner's locale.
    expect(gate.detail).toMatch(/Oct/);
    expect(gate.detail).toMatch(/15/);
    expect(gate.detail).toMatch(/09:43/);
  });

  it('refuses once the window has closed, and says when', () => {
    const gate = registrationGate(
      comp({ registrationClosesAt: '2026-10-01T00:00:00Z' }),
      NOW,
    );

    expect(gate).toMatchObject({ joinable: false, reason: 'closed' });
    expect(gate.detail).toMatch(/Registration closed/);
  });

  it.each(['COMPLETED', 'ARCHIVED'] as CompetitionState[])(
    'refuses a %s competition regardless of its window',
    (state) => {
      // A generous window must not reopen a finished competition.
      const gate = registrationGate(
        comp({ state, registrationOpensAt: null, registrationClosesAt: null }),
        NOW,
      );

      expect(gate).toMatchObject({ joinable: false, reason: 'finished' });
    },
  );

  it('refuses a draft competition', () => {
    expect(registrationGate(comp({ state: 'DRAFT' }), NOW)).toMatchObject({
      joinable: false,
      reason: 'draft',
    });
  });

  // Mirrors the server, which checks the lifecycle before the clock.
  it('reports a finished competition as finished, not as closed registration', () => {
    const gate = registrationGate(
      comp({ state: 'COMPLETED', registrationClosesAt: '2026-10-01T00:00:00Z' }),
      NOW,
    );

    expect(gate).toMatchObject({ reason: 'finished' });
  });

  // LIVE is joinable: a latecomer during a running competition is allowed, which
  // is what the server does too.
  it('allows joining a LIVE competition', () => {
    expect(registrationGate(comp({ state: 'LIVE' }), NOW).joinable).toBe(true);
  });

  it('treats the boundary as open', () => {
    const opensAt = '2026-10-08T12:00:00Z';
    expect(registrationGate(comp({ registrationOpensAt: opensAt }), NOW).joinable).toBe(true);
  });
});
