import type { CompetitionState } from './types';

/// Can this participant enrol, and if not, why?
///
/// "Open for registration" means two independent things, and nothing made that
/// visible until a participant hit it: the lifecycle `state`, which an organizer
/// sets by hand, and the `registrationOpensAt`/`ClosesAt` window, which is a
/// clock. A competition can sit in REGISTRATION with its window a week away, and
/// then the badge says "Registration" while the server refuses every join.
///
/// The Join button was keyed on `state` alone, so it was offered in exactly that
/// case and failed on press. Offering an action that cannot succeed is the same
/// mistake as the dead "Ask for their code" label.
///
/// Mirrors the order of checks in CompetitionsService.join. The server stays
/// authoritative — this only decides what to render, so a clock skew shows the
/// wrong label for a moment rather than letting anyone in early.
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
    // Names the moment. "Registration has not opened yet" left a participant
    // with nothing to do and no idea whether to wait five minutes or a week.
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

/// "15 Oct at 09:43", in the reader's own timezone.
///
/// The stored value is UTC and participants are not, so a raw ISO string would
/// be read off by an hour or more. The year is included only when it is not the
/// current one, because "15 Oct 2026" is noise in 2026.
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
