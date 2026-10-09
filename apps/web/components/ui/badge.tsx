import { cn } from '@/lib/cn';
import type { RoundState, CompetitionState } from '@/lib/types';

/// Exported so the state menu cannot drift from these.
export type Tone = 'neutral' | 'live' | 'success' | 'warn' | 'danger' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-ink-dim',
  live: 'border-live/35 bg-live/10 text-live',
  success: 'border-success/35 bg-success/10 text-success',
  warn: 'border-warn/35 bg-warn/10 text-warn',
  danger: 'border-danger/35 bg-danger/10 text-danger',
  brand: 'border-brand/35 bg-brand/10 text-brand-bright',
};

/// A small status or label chip. Children are rendered as written — there is no
/// `uppercase` here, so callers pass sentence case.
export function Badge({
  tone = 'neutral',
  pulse,
  dot,
  children,
  className,
}: {
  tone?: Tone;
  /// A live state. Implies `dot`, and animates it.
  pulse?: boolean;
  /// For a status, not a plain label: a dot implies one of several states.
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const showDot = dot || pulse;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5',
        'text-[11.5px] font-medium leading-[1.5]',
        TONES[tone],
        className,
      )}
    >
      {showDot && (
        <span aria-hidden className="relative flex size-1.5 shrink-0">
          {pulse && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
          )}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

// Exhaustive by type, so adding a state to RoundState fails the build here
// rather than rendering an unstyled badge nobody notices.
const ROUND_TONES: Record<RoundState, Tone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warn',
  LIVE: 'live',
  PAUSED: 'warn',
  COMPLETED: 'success',
  FINALIZED: 'brand',
  ARCHIVED: 'neutral',
};

/// Written out rather than derived from the enum, so each can be the right
/// word: a paused round resumes and a finalized one is locked, and both read as
/// "over" if left as the member name.
const ROUND_LABELS: Record<RoundState, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  FINALIZED: 'Final',
  ARCHIVED: 'Archived',
};

export function RoundStateBadge({ state }: { state: RoundState }) {
  return (
    <Badge tone={ROUND_TONES[state]} dot pulse={state === 'LIVE'}>
      {ROUND_LABELS[state]}
    </Badge>
  );
}

const COMPETITION_TONES: Record<CompetitionState, Tone> = {
  DRAFT: 'neutral',
  REGISTRATION: 'brand',
  LIVE: 'live',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
};

const COMPETITION_LABELS: Record<CompetitionState, string> = {
  DRAFT: 'Draft',
  // Not "Open" — beside a Join button that would read as "already running".
  REGISTRATION: 'Registration open',
  LIVE: 'Live',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export function CompetitionStateBadge({ state }: { state: CompetitionState }) {
  return (
    <Badge tone={COMPETITION_TONES[state]} dot pulse={state === 'LIVE'}>
      {COMPETITION_LABELS[state]}
    </Badge>
  );
}
