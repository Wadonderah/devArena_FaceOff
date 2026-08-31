import { cn } from '@/lib/cn';
import type { RoundState, CompetitionState } from '@/lib/types';

type Tone = 'neutral' | 'live' | 'success' | 'warn' | 'danger' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-dim border-line',
  live: 'bg-live/15 text-live border-live/40',
  success: 'bg-success/15 text-success border-success/40',
  warn: 'bg-warn/15 text-warn border-warn/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
  brand: 'bg-brand/15 text-brand-bright border-brand/40',
};

export function Badge({
  tone = 'neutral',
  pulse,
  children,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-[11px] font-medium uppercase tracking-[0.08em]',
        TONES[tone],
        className,
      )}
    >
      {pulse && (
        <span aria-hidden className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

const ROUND_TONES: Record<RoundState, Tone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warn',
  LIVE: 'live',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
};

export function RoundStateBadge({ state }: { state: RoundState }) {
  return (
    <Badge tone={ROUND_TONES[state]} pulse={state === 'LIVE'}>
      {state === 'LIVE' ? 'Live now' : state.toLowerCase()}
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

export function CompetitionStateBadge({ state }: { state: CompetitionState }) {
  return (
    <Badge tone={COMPETITION_TONES[state]} pulse={state === 'LIVE'}>
      {state === 'REGISTRATION' ? 'Registration open' : state.toLowerCase()}
    </Badge>
  );
}
