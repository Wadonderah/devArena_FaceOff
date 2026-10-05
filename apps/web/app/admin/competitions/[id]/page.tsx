'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { ConsoleShell } from '@/components/console-shell';
import { Button } from '@/components/ui/button';
import { Badge, CompetitionStateBadge, RoundStateBadge } from '@/components/ui/badge';
import { Field } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { TextAreaField } from '@/components/ui/textarea';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError, describeError } from '@/lib/api';
import type { ChallengeType, Competition, RoundSummary, RoundType } from '@/lib/types';
import { cn } from '@/lib/cn';
import { ALL_LANGUAGES, LANGUAGE_LABELS } from '@/lib/taxonomy';
import { ROUND_ACTIONS, TRANSITION_TOAST } from '@/lib/round-actions';
import {
  RoundScoringFields,
  scoringBody,
  type RoundScoringValues,
} from '@/components/round-scoring-fields';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CompetitionSettings } from '@/components/competition-settings';

interface ChallengeRow {
  id: string;
  type: ChallengeType;
  title: string;
  points: number;
  isPublished: boolean;
}

/// Which challenge type each round type accepts, mirroring CHALLENGE_TYPE_FOR
/// in apps/api/src/rounds/rounds.service.ts.
///
/// Written as an exhaustive Record so a new round type fails the build here.
/// The previous `round.type === 'MCQ' ? 'MCQ' : 'CODING'` predated debugging
/// rounds and quietly lumped them in with coding — so a debugging round listed
/// coding problems the server would have rejected, and hid the debugging
/// challenges it actually wanted.
const CHALLENGE_TYPE_FOR: Record<RoundType, ChallengeType> = {
  MCQ: 'MCQ',
  CODING: 'CODING',
  DEBUGGING: 'DEBUGGING',
};

/// A competition's state is the single most consequential switch an organizer
/// touches — it decides whether anyone can register or compete — and it used to
/// change silently from a dropdown, with no confirmation of any kind.
const COMPETITION_TOAST: Record<string, string> = {
  DRAFT: 'Competition moved back to draft — hidden from participants',
  REGISTRATION: 'Registration is open — participants can join',
  LIVE: 'Competition is live',
  COMPLETED: 'Competition completed',
  ARCHIVED: 'Competition archived',
};

const CHALLENGE_NOUN: Record<RoundType, string> = {
  MCQ: 'questions',
  CODING: 'problems',
  DEBUGGING: 'debugging challenges',
};

function NewRoundForm({ competitionId, onDone }: { competitionId: string; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'MCQ',
    orderIndex: 0,
    weight: 0.5,
    revealMode: 'ON_ROUND_END',
    participationMode: 'INDIVIDUAL',
    allowedLanguages: ['PYTHON', 'JAVASCRIPT'] as string[],
  });
  const [scoring, setScoring] = useState<RoundScoringValues>({
    attemptLimit: '',
    negativeMarking: '',
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/competitions/${competitionId}/rounds`, {
        method: 'POST',
        body: {
          name: form.name,
          ...(form.description ? { description: form.description } : {}),
          type: form.type,
          orderIndex: Number(form.orderIndex),
          weight: Number(form.weight),
          revealMode: form.revealMode,
          participationMode: form.participationMode,
          ...(form.type === 'CODING' || form.type === 'DEBUGGING'
            ? { allowedLanguages: form.allowedLanguages }
            : {}),
          ...scoringBody(scoring, form.type as RoundType),
        },
      }),
    onSuccess: () => {
      toast.success('Round created', form.name);
      onDone();
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Field
        label="Round name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <TextAreaField
        label="Description"
        className="min-h-16"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Type"
          options={[
            { value: 'MCQ', label: 'Multiple choice' },
            { value: 'CODING', label: 'Coding' },
            { value: 'DEBUGGING', label: 'Debugging' },
          ]}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        />
        <SelectField
          label="Scored as"
          options={[
            { value: 'INDIVIDUAL', label: 'Individual' },
            { value: 'TEAM', label: 'Team' },
            { value: 'HYBRID', label: 'Both' },
          ]}
          hint={
            form.participationMode === 'INDIVIDUAL'
              ? 'Each participant scores for themselves.'
              : 'Participants must be in a team to take part.'
          }
          value={form.participationMode}
          onChange={(e) => setForm({ ...form, participationMode: e.target.value })}
        />
        <Field
          label="Order"
          type="number"
          min={0}
          value={form.orderIndex}
          onChange={(e) => setForm({ ...form, orderIndex: Number(e.target.value) })}
        />
        <Field
          label="Weight"
          type="number"
          step="0.05"
          min={0}
          max={1}
          hint="Share of the final score"
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
        />
        <SelectField
          label="Answer reveal"
          options={[
            { value: 'ON_ROUND_END', label: 'When round ends' },
            { value: 'IMMEDIATE', label: 'Immediately' },
            { value: 'NEVER', label: 'Never' },
          ]}
          hint={form.type === 'MCQ' ? 'Fixed once the round goes live' : 'MCQ rounds only'}
          value={form.revealMode}
          onChange={(e) => setForm({ ...form, revealMode: e.target.value })}
        />
      </div>

      <RoundScoringFields
        type={form.type as RoundType}
        values={scoring}
        onChange={setScoring}
      />

      {(form.type === 'CODING' || form.type === 'DEBUGGING') && (
        <fieldset className="rounded-xl border border-line bg-surface-1 p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-dim">
            Allowed languages
          </legend>
          <p className="mb-3 text-[13px] text-ink-faint">
            Participants may only submit in a language you select here. Every one is verified
            against the judge.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ALL_LANGUAGES.map((lang) => {
              const checked = form.allowedLanguages.includes(lang);
              return (
                <label
                  key={lang}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                    checked
                      ? 'border-brand bg-brand/10 text-ink'
                      : 'border-line text-ink-dim hover:border-line-bright',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setForm({
                        ...form,
                        allowedLanguages: checked
                          ? form.allowedLanguages.filter((l) => l !== lang)
                          : [...form.allowedLanguages, lang],
                      })
                    }
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {LANGUAGE_LABELS[lang]}
                </label>
              );
            })}
          </div>
          {form.allowedLanguages.length === 0 && (
            <p className="mt-2.5 text-[13px] text-warn">
              Select at least one, or participants cannot submit anything.
            </p>
          )}
        </fieldset>
      )}

      {create.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {create.error instanceof ApiError ? create.error.displayMessage : 'Could not create round.'}
        </p>
      )}

      <Button type="submit" loading={create.isPending}>
        Create round
      </Button>
    </form>
  );
}

function ChallengePicker({ round, onDone }: { round: RoundSummary; onDone: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ['admin-challenges'],
    queryFn: () => api<ChallengeRow[]>('/challenges'),
  });

  const assign = useMutation({
    mutationFn: () =>
      api(`/rounds/${round.id}/challenges`, {
        method: 'POST',
        body: { challengeIds: selected },
      }),
    onSuccess: () => {
      toast.success(
        `${selected.length} ${selected.length === 1 ? 'challenge' : 'challenges'} assigned`,
        round.name,
      );
      onDone();
    },
    onError: (error) =>
      toast.error(
        'Could not assign challenges',
        error instanceof ApiError ? error.displayMessage : undefined,
      ),
  });

  // A round only accepts challenges of its own type, and only published ones —
  // both enforced server-side, so filtering here avoids offering a guaranteed 400.
  const eligible = (data ?? []).filter(
    (c) => c.isPublished && c.type === CHALLENGE_TYPE_FOR[round.type],
  );

  const noun = CHALLENGE_NOUN[round.type];

  // An authored-but-unpublished challenge is the likeliest reason the list looks
  // empty, and it is invisible from here — so say so rather than implying none
  // exist.
  const unpublished = (data ?? []).filter(
    (c) => !c.isPublished && c.type === CHALLENGE_TYPE_FOR[round.type],
  ).length;

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-1 p-4">
      <p className="mb-2.5 text-[13px] text-ink-dim">
        Select published {noun} for this round.
      </p>

      {eligible.length === 0 ? (
        <p className="text-[14px] text-ink-faint">
          {unpublished > 0 ? (
            <>
              {unpublished} {noun} authored but not published — publish them in the{' '}
              <Link
                href="/admin/challenges"
                className="text-brand-bright underline underline-offset-4"
              >
                challenge library
              </Link>
              .
            </>
          ) : (
            <>
              No {noun} yet —{' '}
              <Link
                href="/admin/challenges"
                className="text-brand-bright underline underline-offset-4"
              >
                create some
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <>
          <ul className="mb-3 space-y-1.5">
            {eligible.map((challenge) => {
              const checked = selected.includes(challenge.id);
              return (
                <li key={challenge.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[14px]',
                      checked ? 'border-brand bg-brand/10' : 'border-line hover:border-line-bright',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelected(
                          checked
                            ? selected.filter((id) => id !== challenge.id)
                            : [...selected, challenge.id],
                        )
                      }
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    <span className="flex-1">{challenge.title}</span>
                    <span className="text-[13px] text-ink-faint">{challenge.points} pts</span>
                  </label>
                </li>
              );
            })}
          </ul>

          {assign.error && (
            <p role="alert" className="mb-2.5 text-[13px] text-danger">
              {assign.error instanceof ApiError ? assign.error.displayMessage : 'Could not assign.'}
            </p>
          )}

          <Button
            size="sm"
            disabled={selected.length === 0}
            loading={assign.isPending}
            onClick={() => assign.mutate()}
          >
            Assign {selected.length || ''} to round
          </Button>
        </>
      )}
    </div>
  );
}

/// Editing a round after it is created.
///
/// The API has allowed this all along (`PATCH /rounds/:id`); there was simply no
/// screen for it, so a round's weight, timing and scoring rules were fixed at
/// creation in practice. Attempt limits in particular could not be set at all.
///
/// Only offered while DRAFT or SCHEDULED, matching the server: once a round is
/// live its terms are frozen, because changing weight or timing mid-round
/// silently rescores work already submitted under the old rules.
function EditRoundForm({ round, onDone }: { round: RoundSummary; onDone: () => void }) {
  const toast = useToast();

  const [form, setForm] = useState({
    name: round.name,
    description: round.description ?? '',
    weight: Number(round.weight ?? 0),
    revealMode: (round.revealMode ?? 'ON_ROUND_END') as string,
    participationMode: (round.participationMode ?? 'INDIVIDUAL') as string,
    allowedLanguages: (round.allowedLanguages ?? []) as string[],
  });

  const [scoring, setScoring] = useState<RoundScoringValues>({
    // A null attemptLimit means unlimited, which is an empty box — not a "0".
    attemptLimit: round.attemptLimit == null ? '' : String(round.attemptLimit),
    negativeMarking:
      round.negativeMarking == null || Number(round.negativeMarking) === 0
        ? ''
        : String(Number(round.negativeMarking)),
  });

  const isCode = round.type === 'CODING' || round.type === 'DEBUGGING';

  const save = useMutation({
    mutationFn: () =>
      api(`/rounds/${round.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          description: form.description,
          weight: Number(form.weight),
          revealMode: form.revealMode,
          participationMode: form.participationMode,
          ...(isCode ? { allowedLanguages: form.allowedLanguages } : {}),
          ...scoringBody(scoring, round.type),
        },
      }),
    onSuccess: () => {
      toast.success('Round updated', form.name);
      onDone();
    },
  });

  return (
    <form
      className="mt-3 space-y-4 rounded-xl border border-line bg-surface-1 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field
        label="Round name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <TextAreaField
        label="Description"
        className="min-h-16"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Weight"
          type="number"
          step="0.05"
          min={0}
          max={1}
          hint="Share of the final score"
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
        />
        <SelectField
          label="Scored as"
          options={[
            { value: 'INDIVIDUAL', label: 'Individual' },
            { value: 'TEAM', label: 'Team' },
            { value: 'HYBRID', label: 'Both' },
          ]}
          value={form.participationMode}
          onChange={(e) => setForm({ ...form, participationMode: e.target.value })}
        />
        {round.type === 'MCQ' && (
          <SelectField
            label="Answer reveal"
            options={[
              { value: 'ON_ROUND_END', label: 'When round ends' },
              { value: 'IMMEDIATE', label: 'Immediately' },
              { value: 'NEVER', label: 'Never' },
            ]}
            value={form.revealMode}
            onChange={(e) => setForm({ ...form, revealMode: e.target.value })}
          />
        )}
      </div>

      <RoundScoringFields type={round.type} values={scoring} onChange={setScoring} />

      {isCode && (
        <fieldset className="rounded-xl border border-line bg-surface-0 p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-dim">Allowed languages</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ALL_LANGUAGES.map((lang) => {
              const checked = form.allowedLanguages.includes(lang);
              return (
                <label
                  key={lang}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                    checked
                      ? 'border-brand bg-brand/10 text-ink'
                      : 'border-line text-ink-dim hover:border-line-bright',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setForm({
                        ...form,
                        allowedLanguages: checked
                          ? form.allowedLanguages.filter((l) => l !== lang)
                          : [...form.allowedLanguages, lang],
                      })
                    }
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {LANGUAGE_LABELS[lang]}
                </label>
              );
            })}
          </div>
          {form.allowedLanguages.length === 0 && (
            <p className="mt-2.5 text-[13px] text-warn">
              Pick at least one, or nobody can submit.
            </p>
          )}
        </fieldset>
      )}

      {save.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {save.error instanceof ApiError ? save.error.displayMessage : 'Could not save.'}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={save.isPending}>
          Save changes
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RoundRow({ round, onChanged }: { round: RoundSummary; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const actions = ROUND_ACTIONS[round.state] ?? [];

  // Tracked so only the pressed button spins — a shared `isPending` lights up
  // every action in the row.
  const [pending, setPending] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // DRAFT and SCHEDULED are both the states a round can still be edited in and
  // the only ones it can be deleted in — neither has accepted a submission.
  // The server enforces the same rule; this only avoids offering a 409.
  const editable = round.state === 'DRAFT' || round.state === 'SCHEDULED';

  const transition = useMutation({
    mutationFn: (path: string) => api(`/rounds/${round.id}/${path}`, { method: 'POST' }),
    onSuccess: (_data, path) => {
      toast.success(TRANSITION_TOAST[path] ?? 'Round updated', round.name);
      onChanged();
    },
    onError: (error) =>
      toast.error(
        'Could not update the round',
        error instanceof ApiError ? error.displayMessage : undefined,
      ),
    onSettled: () => setPending(null),
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/rounds/${round.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Round deleted', round.name);
      onChanged();
    },
    onError: (error) => {
      const { title, detail } = describeError(error, 'Could not delete the round');
      toast.error(title, detail);
      setConfirmingDelete(false);
    },
  });

  return (
    <li className="border-b border-line/60 px-4 py-3.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[15px]">{round.name}</span>
            <RoundStateBadge state={round.state} />
            <Badge>{round.type}</Badge>
            {round.participationMode && round.participationMode !== 'INDIVIDUAL' && (
              <Badge tone="brand">
                {round.participationMode === 'TEAM' ? 'Team scored' : 'Team + individual'}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-faint">
            {round._count.challenges} challenges · order {round.orderIndex}
          </p>
          {transition.error && (
            <p role="alert" className="mt-1 text-[13px] text-danger">
              {transition.error instanceof ApiError
                ? transition.error.displayMessage
                : 'Could not update.'}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {editable && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(!editing);
                  setPicking(false);
                }}
              >
                {editing ? 'Close' : 'Edit'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPicking(!picking);
                  setEditing(false);
                }}
              >
                {picking ? 'Close' : 'Challenges'}
              </Button>

              {/* The shared dialog rather than a bespoke two-step, so every
                  destructive action in the app asks the same way. */}
              <Button
                size="sm"
                variant="ghost"
                loading={remove.isPending}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            </>
          )}
          {actions.map((action) => (
            <Button
              key={action.path}
              size="sm"
              variant={action.variant ?? 'primary'}
              loading={pending === action.path}
              disabled={transition.isPending}
              onClick={() => {
                setPending(action.path);
                transition.mutate(action.path);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete "${round.name}"?`}
        description="This round has not opened, so nothing anyone submitted is lost. It cannot be undone, and its challenges will need attaching again if you recreate it."
        confirmLabel="Delete round"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmingDelete(false)}
      />

      {editing && (
        <EditRoundForm
          round={round}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}

      {picking && (
        <ChallengePicker
          round={round}
          onDone={() => {
            setPicking(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

function ManageCompetition({ id }: { id: string }) {
  const [addingRound, setAddingRound] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-competition', id],
    queryFn: () => api<Competition>(`/competitions/${id}`),
  });

  const setState = useMutation({
    mutationFn: (state: string) =>
      api(`/competitions/${id}`, { method: 'PATCH', body: { state } }),
    onSuccess: (_data, state) => {
      toast.success(COMPETITION_TOAST[state] ?? 'Competition updated');
      queryClient.invalidateQueries({ queryKey: ['admin-competition', id] });
      // The participant-facing lists key off this too, so a competition opening
      // for registration shows up without anyone reloading.
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competition', id] });
    },
    onError: (error) =>
      toast.error(
        'Could not change the competition state',
        error instanceof ApiError ? error.displayMessage : undefined,
      ),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-competition', id] });

  if (isLoading) return <SkeletonRows rows={4} />;
  if (!data) return null;

  const totalWeight = data.rounds.reduce((sum, r) => sum + Number((r as { weight?: number }).weight ?? 0), 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl">{data.name}</h1>
            <CompetitionStateBadge state={data.state} />
          </div>
          <p className="mt-1.5 text-[15px] text-ink-dim">Rounds, challenges and scheduling.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <SelectField
            label=""
            aria-label="Competition state"
            options={[
              { value: 'DRAFT', label: 'Draft' },
              { value: 'REGISTRATION', label: 'Registration open' },
              { value: 'LIVE', label: 'Live' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
            value={data.state}
            onChange={(e) => setState.mutate(e.target.value)}
          />
          <Link href={`/leaderboard/${id}`}>
            <Button variant="secondary">Leaderboard</Button>
          </Link>
        </div>
      </header>

      {setState.error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {setState.error instanceof ApiError ? setState.error.displayMessage : 'Could not update.'}
        </p>
      )}

      <div className="mb-5">
        <CompetitionSettings competition={data} />
      </div>

      <section className="panel hairline overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-lg">Rounds</h2>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              Weights total {totalWeight.toFixed(2)} of a maximum 1.00
            </p>
          </div>
          <Button
            variant={addingRound ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setAddingRound(!addingRound)}
          >
            {addingRound ? 'Cancel' : 'New round'}
          </Button>
        </div>

        {addingRound && (
          <div className="border-b border-line bg-surface-1/60 p-4">
            <NewRoundForm
              competitionId={id}
              onDone={() => {
                setAddingRound(false);
                refresh();
              }}
            />
          </div>
        )}

        {data.rounds.length === 0 ? (
          <p className="p-8 text-center text-[14px] text-ink-dim">
            No rounds yet. Create one to get started.
          </p>
        ) : (
          <ul>
            {data.rounds.map((round) => (
              <RoundRow key={round.id} round={round} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function AdminCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate requireStaff>
      <ConsoleShell>
        <ManageCompetition id={id} />
      </ConsoleShell>
    </AuthGate>
  );
}
