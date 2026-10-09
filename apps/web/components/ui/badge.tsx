import { cn } from '@/lib/cn';
import type { RoundState, CompetitionState } from '@/lib/types';

/// Exported so a control that has to agree with a badge — the state menu —
/// cannot drift from it by keeping a second private copy of the list.
export type Tone = 'neutral' | 'live' | 'success' | 'warn' | 'danger' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-ink-dim',
  live: 'border-live/35 bg-live/10 text-live',
  success: 'border-success/35 bg-success/10 text-success',
  warn: 'border-warn/35 bg-warn/10 text-warn',
  danger: 'border-danger/35 bg-danger/10 text-danger',
  brand: 'border-brand/35 bg-brand/10 text-brand-bright',
};

/// A small status or label chip.
///
/// Rewritten because a row of these read as sloppy, and the cause was four
/// treatments stacked on one small element: a tinted fill, a 40%-opacity
/// border, `uppercase`, and 0.08em letter-spacing. Any two of those are fine.
/// All four turn an 11px chip into a wide shouting blob — "REGISTRATION OPEN"
/// was seventeen tracked capitals, which is wider than most of the names it sat
/// beside.
///
/// Dropping `uppercase` and the tracking is most of the fix, and it also
/// repaired every chip that was already passing sentence-case text: "You
/// captain this team" and "Answer from document" were being rendered as
/// shouting, which no caller intended.
///
/// `whitespace-nowrap` because a chip that wraps onto two lines inside its own
/// border does not read as a chip at all.
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
  /// Marks this as a *status* rather than a label. A plain label — "Captain",
  /// "Full" — deliberately has no dot: a dot promises that the thing is in one
  /// of several states, and those are not.
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

/// Every label is written out rather than derived from the enum.
///
/// These used to be `state.toLowerCase()` with a CSS `uppercase` on top, which
/// worked only for as long as the chip shouted — the moment the casing was
/// dropped, "draft" and "completed" rendered lowercase. Spelling them out also
/// lets each one be the right word rather than the enum's: a paused round
/// resumes and a finalized one is locked, and both read as "over" if left as
/// the member name.
///
/// "Live" rather than "Live now": the dot beside it is already pulsing, so
/// "now" was a word spent repeating an animation.
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
  // Kept long where the short version would be ambiguous. "Open" beside a Join
  // button could mean the competition itself is running.
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
