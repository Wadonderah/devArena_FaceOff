'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Badge, CompetitionStateBadge, RoundStateBadge } from '@/components/ui/badge';
import { Field } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { TextAreaField } from '@/components/ui/textarea';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { Competition, RoundState, RoundSummary } from '@/lib/types';
import { cn } from '@/lib/cn';

interface ChallengeRow {
  id: string;
  type: 'MCQ' | 'CODING';
  title: string;
  points: number;
  isPublished: boolean;
}

// Mirrors the server's state machine so the UI never offers a transition that
// would 409. The server remains authoritative.
const NEXT_ACTION: Partial<Record<RoundState, { path: string; label: string }>> = {
  DRAFT: { path: 'schedule', label: 'Schedule' },
  SCHEDULED: { path: 'start', label: 'Start' },
  LIVE: { path: 'end', label: 'End' },
  COMPLETED: { path: 'archive', label: 'Archive' },
};

function NewRoundForm({ competitionId, onDone }: { competitionId: string; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'MCQ',
    orderIndex: 0,
    weight: 0.5,
    revealMode: 'ON_ROUND_END',
    participationMode: 'INDIVIDUAL',
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
          ...(form.type === 'CODING'
            ? { allowedLanguages: ['PYTHON', 'JAVASCRIPT'] }
            : {}),
        },
      }),
    onSuccess: onDone,
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
    onSuccess: onDone,
  });

  // A round only accepts challenges of its own type, and only published ones —
  // both enforced server-side, so filtering here avoids offering a guaranteed 400.
  const eligible = (data ?? []).filter(
    (c) => c.isPublished && c.type === (round.type === 'MCQ' ? 'MCQ' : 'CODING'),
  );

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-1 p-4">
      <p className="mb-2.5 text-[13px] text-ink-dim">
        Select published {round.type === 'MCQ' ? 'questions' : 'problems'} for this round.
      </p>

      {eligible.length === 0 ? (
        <p className="text-[14px] text-ink-faint">
          No published {round.type === 'MCQ' ? 'questions' : 'problems'} yet —{' '}
          <Link href="/admin/challenges" className="text-brand-bright underline underline-offset-4">
            create some
          </Link>
          .
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

function RoundRow({ round, onChanged }: { round: RoundSummary; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  const action = NEXT_ACTION[round.state];
  const editable = round.state === 'DRAFT' || round.state === 'SCHEDULED';

  const transition = useMutation({
    mutationFn: (path: string) => api(`/rounds/${round.id}/${path}`, { method: 'POST' }),
    onSuccess: onChanged,
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
            <Button size="sm" variant="secondary" onClick={() => setPicking(!picking)}>
              {picking ? 'Close' : 'Challenges'}
            </Button>
          )}
          {action && (
            <Button
              size="sm"
              variant={round.state === 'LIVE' ? 'danger' : 'primary'}
              loading={transition.isPending}
              onClick={() => transition.mutate(action.path)}
            >
              {action.label}
            </Button>
          )}
        </div>
      </div>

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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-competition', id],
    queryFn: () => api<Competition>(`/competitions/${id}`),
  });

  const setState = useMutation({
    mutationFn: (state: string) =>
      api(`/competitions/${id}`, { method: 'PATCH', body: { state } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-competition', id] }),
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
      <Shell>
        <ManageCompetition id={id} />
      </Shell>
    </AuthGate>
  );
}
