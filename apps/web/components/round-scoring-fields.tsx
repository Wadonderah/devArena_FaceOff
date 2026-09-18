'use client';

import { Field } from '@/components/ui/input';
import type { RoundType } from '@/lib/types';

/// The two optional scoring rules a round can carry.
///
/// Shared by the create and edit forms rather than duplicated: they were missing
/// from both, which meant `attemptLimit` and `negativeMarking` could be set only
/// by calling the API directly. Two copies is how they would go missing from one
/// of them again.
///
/// Both are stored as strings so an empty box means "no rule" and survives being
/// cleared — `Number('')` is 0, and a zero attempt limit would mean nobody can
/// submit at all.
export interface RoundScoringValues {
  attemptLimit: string;
  negativeMarking: string;
}

/// Only sends a key when the organizer actually typed something, so clearing a
/// box does not post a 0 the API would take literally.
export function scoringBody(values: RoundScoringValues, type: RoundType) {
  return {
    ...(values.attemptLimit ? { attemptLimit: Number(values.attemptLimit) } : {}),
    ...(type === 'MCQ' && values.negativeMarking
      ? { negativeMarking: Number(values.negativeMarking) }
      : {}),
  };
}

export function RoundScoringFields({
  type,
  values,
  onChange,
}: {
  type: RoundType;
  values: RoundScoringValues;
  onChange: (values: RoundScoringValues) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-line bg-surface-1 p-4">
      <legend className="px-1 text-[13px] font-medium text-ink-dim">Scoring rules</legend>
      <p className="mb-3 text-[13px] text-ink-faint">
        Both are optional and shown to participants before they answer. Leave blank for the
        default.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Attempt limit"
          type="number"
          min={1}
          max={50}
          placeholder="Unlimited"
          hint={
            type === 'MCQ'
              ? 'MCQ answers are already one-per-question, so this changes nothing here.'
              : 'Graded submissions per challenge. Running code stays free and unlimited.'
          }
          value={values.attemptLimit}
          onChange={(e) => onChange({ ...values, attemptLimit: e.target.value })}
        />

        {type === 'MCQ' && (
          <Field
            label="Negative marking"
            type="number"
            step="0.5"
            min={0}
            max={100}
            placeholder="0"
            hint="Points lost per wrong answer. Never more than the question is worth, and the round floors at zero."
            value={values.negativeMarking}
            onChange={(e) => onChange({ ...values, negativeMarking: e.target.value })}
          />
        )}
      </div>
    </fieldset>
  );
}
