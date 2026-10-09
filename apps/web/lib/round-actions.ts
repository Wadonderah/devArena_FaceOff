import type { RoundState } from '@/lib/types';

export type RoundAction = {
  path: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

/// Mirrors the server's state machine in apps/api/src/rounds/round-state.ts.
/// The server is authoritative; this only avoids offering a button that 409s.
///
/// A list, not a single action: a live round can be paused (it comes back) or
/// ended (it does not), and one button for both ends rounds by accident.
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
  // Separate from ending: organizers review results before locking them.
  COMPLETED: [
    { path: 'finalize', label: 'Finalize scores', variant: 'primary' },
    { path: 'archive', label: 'Archive', variant: 'secondary' },
  ],
  // Steps back to COMPLETED to correct a published result. Does NOT reopen
  // submissions — the round never returns to LIVE.
  FINALIZED: [
    { path: 'unlock', label: 'Unlock scores', variant: 'secondary' },
    { path: 'archive', label: 'Archive', variant: 'secondary' },
  ],
};

/// Keyed by endpoint path so the toast cannot drift from the action taken.
export const TRANSITION_TOAST: Record<string, string> = {
  schedule: 'Round scheduled',
  start: 'Round is live',
  pause: 'Round paused — participants cannot submit',
  resume: 'Round resumed',
  end: 'Round ended',
  finalize: 'Scores finalized and locked',
  unlock: 'Scores unlocked — correct them, then finalize again',
  archive: 'Round archived',
};
