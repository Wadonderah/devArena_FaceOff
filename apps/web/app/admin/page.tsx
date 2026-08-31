'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { CompetitionStateBadge, RoundStateBadge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Field } from '@/components/ui/input';
import { TextAreaField } from '@/components/ui/textarea';
import { useState } from 'react';
import { api, ApiError, apiUrl } from '@/lib/api';
import type { CompetitionListItem, RoundState, RoundSummary } from '@/lib/types';

interface Overview {
  competitions: number;
  participants: number;
  submissions: number;
  pendingSubmissions: number;
  failedSubmissions: number;
}

// The transition each state can move to, mirroring the server's state machine.
// The server is authoritative — this only avoids offering a button that would 409.
const NEXT_ACTION: Partial<Record<RoundState, { path: string; label: string }>> = {
  DRAFT: { path: 'schedule', label: 'Schedule' },
  SCHEDULED: { path: 'start', label: 'Start round' },
  LIVE: { path: 'end', label: 'End round' },
  COMPLETED: { path: 'archive', label: 'Archive' },
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
  return (
    <div className="panel hairline p-4">
      <p className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">{label}</p>
      <p
        className={`tabular mt-1 font-display text-2xl ${
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function RoundRow({ round, onChanged }: { round: RoundSummary; onChanged: () => void }) {
  const action = NEXT_ACTION[round.state];

  const transition = useMutation({
    mutationFn: (path: string) => api(`/rounds/${round.id}/${path}`, { method: 'POST' }),
    onSuccess: onChanged,
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15px]">{round.name}</span>
          <RoundStateBadge state={round.state} />
        </div>
        <p className="mt-0.5 text-[13px] text-ink-faint">
          {round.type} · {round._count.challenges} challenges · weight shown in API
        </p>
        {transition.error && (
          <p role="alert" className="mt-1 text-[13px] text-danger">
            {transition.error instanceof ApiError
              ? transition.error.displayMessage
              : 'Could not update.'}
          </p>
        )}
      </div>

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
    </li>
  );
}

function CompetitionAdmin({ competition }: { competition: CompetitionListItem }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-competition', competition.id],
    queryFn: () => api<{ rounds: RoundSummary[] }>(`/competitions/${competition.id}`),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-[14px]" />;

  return (
    <section className="panel hairline overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg">{competition.name}</h2>
          <CompetitionStateBadge state={competition.state} />
        </div>

        <div className="flex gap-2">
          <Link href={`/admin/competitions/${competition.id}`}>
            <Button size="sm">Manage</Button>
          </Link>
          <Link href={`/leaderboard/${competition.id}`}>
            <Button size="sm" variant="ghost">Leaderboard</Button>
          </Link>
          {/* A plain link, not fetch(): the browser handles the download and
              sends the session cookie automatically. */}
          <a href={apiUrl(`/admin/competitions/${competition.id}/export.csv`)}>
            <Button size="sm" variant="secondary">Export CSV</Button>
          </a>
        </div>
      </div>

      {data && data.rounds.length > 0 ? (
        <ul>
          {data.rounds.map((round) => (
            <RoundRow
              key={round.id}
              round={round}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: ['admin-competition', competition.id] });
                queryClient.invalidateQueries({ queryKey: ['competition', competition.id] });
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="p-6 text-center text-[14px] text-ink-dim">No rounds yet.</p>
      )}
    </section>
  );
}

function NewCompetitionForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', slug: '', description: '' });

  const create = useMutation({
    mutationFn: () =>
      api('/competitions', {
        method: 'POST',
        body: {
          name: form.name,
          slug: form.slug,
          ...(form.description ? { description: form.description } : {}),
        },
      }),
    onSuccess: onDone,
  });

  // Derive the slug from the name until the organizer edits it themselves; the
  // API rejects anything that is not lowercase-hyphenated.
  const setName = (name: string) =>
    setForm((prev) => ({
      ...prev,
      name,
      slug:
        prev.slug === slugify(prev.name)
          ? slugify(name)
          : prev.slug,
    }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required value={form.name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Slug"
          required
          hint="Lowercase words separated by hyphens"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
      </div>

      <TextAreaField
        label="Description"
        className="min-h-16"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />

      {create.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {create.error instanceof ApiError ? create.error.displayMessage : 'Could not create.'}
        </p>
      )}

      <Button type="submit" loading={create.isPending}>
        Create competition
      </Button>
    </form>
  );
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function AdminContent() {
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: overview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Overview>('/admin/overview'),
    refetchInterval: 10_000,
  });

  const { data: competitions, isLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: () => api<CompetitionListItem[]>('/competitions'),
  });

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Organizer console</h1>
          <p className="mt-1.5 text-[15px] text-ink-dim">
            Create competitions and rounds, author challenges, run the event.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/challenges">
            <Button variant="secondary">Challenge library</Button>
          </Link>
          <Button
            variant={creating ? 'secondary' : 'primary'}
            onClick={() => setCreating(!creating)}
          >
            {creating ? 'Cancel' : 'New competition'}
          </Button>
        </div>
      </header>

      {creating && (
        <section className="panel hairline mb-6 p-6">
          <h2 className="mb-4 text-lg">New competition</h2>
          <NewCompetitionForm
            onDone={() => {
              setCreating(false);
              queryClient.invalidateQueries({ queryKey: ['competitions'] });
            }}
          />
        </section>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {overview ? (
          <>
            <Stat label="Competitions" value={overview.competitions} />
            <Stat label="Participants" value={overview.participants} />
            <Stat label="Submissions" value={overview.submissions} />
            <Stat label="In flight" value={overview.pendingSubmissions} tone="warn" />
            <Stat label="Failed" value={overview.failedSubmissions} tone="danger" />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-[14px]" />)
        )}
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-4">
          {competitions?.map((competition) => (
            <CompetitionAdmin key={competition.id} competition={competition} />
          ))}
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <AuthGate requireStaff>
      <Shell>
        <AdminContent />
      </Shell>
    </AuthGate>
  );
}
