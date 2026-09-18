import type { RoundSummary } from '@/lib/types';

/// The rules a participant is judged by, stated before they commit to anything.
///
/// Both of these used to exist only on the server: the first a participant heard
/// about an attempt cap was a 403 after their last try, and negative marking was
/// invisible until the score came back lower than the questions they got right.
/// Being scored by a rule you were never shown is the complaint this prevents.
///
/// Renders nothing when neither rule applies, so an ordinary round gains no
/// chrome for constraints it does not have.
export function RoundRules({ round }: { round: Pick<RoundSummary, 'attemptLimit' | 'negativeMarking'> }) {
  const penalty = Number(round.negativeMarking ?? 0);
  const attempts = round.attemptLimit ?? null;

  const rules: string[] = [];

  if (attempts !== null) {
    rules.push(
      attempts === 1
        ? 'One graded submission per challenge — running your code first is free and unlimited.'
        : `${attempts} graded submissions per challenge. Running your code first is free and unlimited.`,
    );
  }

  if (penalty > 0) {
    rules.push(
      `A wrong answer costs ${penalty} point${penalty === 1 ? '' : 's'}. Your round score will not go below zero.`,
    );
  }

  if (rules.length === 0) return null;

  return (
    <aside className="mb-5 rounded-xl border border-warn/35 bg-warn/[0.07] px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-warn">
        How this round is scored
      </p>
      <ul className="mt-2 space-y-1">
        {rules.map((rule) => (
          <li key={rule} className="text-[14px] leading-relaxed text-ink-dim">
            {rule}
          </li>
        ))}
      </ul>
    </aside>
  );
}
