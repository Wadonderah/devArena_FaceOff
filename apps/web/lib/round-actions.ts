import type { RoundState } from '@/lib/types';

export type RoundAction = {
  path: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

/// The transitions each round state can move to, mirroring the server's state
/// machine in apps/api/src/rounds/round-state.ts. The server is authoritative —
/// this only avoids offering a button that would 409.
///
/// Shared between the console landing page and the competition manager, which
/// both render round rows. Two copies drifted the moment PAUSED and FINALIZED
/// were added: neither page grew a button, so four working endpoints were
/// unreachable from the UI.
///
/// A list rather than a single action because a live round has two sensible
/// moves — pause it (it comes back) or end it (it does not). Collapsing those
/// into one button is how an organizer ends a round they meant to pause.
export const ROUND_ACTIONS: Partial<Record<RoundState, RoundAction[]>> = {
  DRAFT: [{ path: 'schedule', label: 'Schedule' }],
  SCHEDULED: [{ path: 'start', label: 'Start round' }],
  LIVE: [
    { path: 'pause', label: 'Pause', variant: 'secondary' },
    { path: 'end', label: 'End round', variant: 'danger' },
  ],
  PAUSED: [
    { path: 'resume', label: 'Resume', variant: 'primary' },
    { path: 'end', label: 'End round', variant: 'danger' },
  ],
  // Finalizing locks scores, so it is deliberately a separate step from ending:
  // an organizer usually wants to review results before declaring them.
  COMPLETED: [
    { path: 'finalize', label: 'Finalize scores', variant: 'primary' },
    { path: 'archive', label: 'Archive', variant: 'secondary' },
  ],
  FINALIZED: [{ path: 'archive', label: 'Archive', variant: 'secondary' }],
};

/// What each transition should say once it succeeds.
///
/// Keyed by the endpoint path so the toast cannot drift from the action that was
/// actually taken. Deliberately specific — "Round updated" after pressing
/// Finalize does not tell an organizer that scores are now locked.
export const TRANSITION_TOAST: Record<string, string> = {
  schedule: 'Round scheduled',
  start: 'Round is live',
  pause: 'Round paused — participants cannot submit',
  resume: 'Round resumed',
  end: 'Round ended',
  finalize: 'Scores finalized and locked',
  archive: 'Round archived',
};
