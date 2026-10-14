import type { CompetitionState } from './types';

/// Can this participant enrol, and if not, why?
///
/// "Open for registration" is two independent things that can disagree: the
/// lifecycle `state` an organizer sets, and the `registrationOpensAt`/`ClosesAt`
/// clock. A competition can sit in REGISTRATION with its window a week away, so
/// keying a Join button on `state` alone offers one the server will refuse.
///
/// Mirrors the order of checks in CompetitionsService.join, which stays
/// authoritative — this only decides what to render.
export type RegistrationGate =
  | { joinable: true; detail: null }
  | { joinable: false; reason: 'finished' | 'draft' | 'not-open' | 'closed'; detail: string };

export function registrationGate(
  competition: {
    state: CompetitionState;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
  },
  now: number = Date.now(),
): RegistrationGate {
  const { state, registrationOpensAt, registrationClosesAt } = competition;

  if (state === 'DRAFT') {
    return { joinable: false, reason: 'draft', detail: 'This competition is not published yet.' };
  }

  if (state === 'COMPLETED' || state === 'ARCHIVED') {
    return {
      joinable: false,
      reason: 'finished',
      detail: 'This competition has already finished.',
    };
  }

  const opensAt = registrationOpensAt ? new Date(registrationOpensAt) : null;
  if (opensAt && now < opensAt.getTime()) {
    // Names the moment, so the reader knows whether to wait minutes or a week.
    return {
      joinable: false,
      reason: 'not-open',
      detail: `Registration opens ${formatWhen(opensAt)}.`,
    };
  }

  const closesAt = registrationClosesAt ? new Date(registrationClosesAt) : null;
  if (closesAt && now > closesAt.getTime()) {
    return {
      joinable: false,
      reason: 'closed',
      detail: `Registration closed ${formatWhen(closesAt)}.`,
    };
  }

  return { joinable: true, detail: null };
}

/// "15 Oct at 09:43", in the reader's own timezone — the stored value is UTC.
/// The year appears only when it is not the current one.
function formatWhen(date: Date, now: Date = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear();

  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return `${day} at ${time}`;
}
