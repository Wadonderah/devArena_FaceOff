'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/input';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/cn';

interface AdminUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  profile: { displayName: string; country: string | null } | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; email: string } | null;
}

interface HealthDetail {
  status: string;
  [key: string]: unknown;
}

const ROLES: Role[] = ['PARTICIPANT', 'ORGANIZER', 'SUPER_ADMIN'];

const ROLE_LABEL: Record<Role, string> = {
  PARTICIPANT: 'Participant',
  ORGANIZER: 'Organizer',
  SUPER_ADMIN: 'Super admin',
};

function HealthPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-health'],
    // Hits the readiness probe directly rather than through /api, since health
    // is deliberately mounted outside the API prefix.
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const res = await fetch(`${base}/health`, { credentials: 'include' });
      const body = await res.json();
      return (body.details?.details ?? body.details ?? body.info ?? {}) as Record<
        string,
        HealthDetail
      >;
    },
    refetchInterval: 15_000,
  });

  if (isLoading) return <Skeleton className="h-24 w-full rounded-[14px]" />;

  const entries = Object.entries(data ?? {});

  return (
    <section className="panel hairline p-5">
      <h2 className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">Dependencies</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {entries.map(([name, detail]) => {
          const up = detail.status === 'up';
          return (
            <li
              key={name}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-1 px-3.5 py-2.5"
            >
              <span className="text-[14px] capitalize">{name}</span>
              <Badge tone={up ? 'success' : 'danger'}>{up ? 'up' : 'down'}</Badge>
            </li>
          );
        })}
      </ul>
      {entries.some(([, d]) => d.status !== 'up') && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {entries
            .filter(([, d]) => d.status !== 'up')
            .map(([name, d]) => `${name}: ${(d.reason as string) ?? (d.message as string) ?? 'unavailable'}`)
            .join(' · ')}
        </p>
      )}
    </section>
  );
}

function PeoplePanel() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () =>
      api<AdminUser[]>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/admin/users/${id}/active`, { method: 'PATCH', body: { isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const error = setRole.error ?? setActive.error;

  return (
    <section className="panel hairline overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h2 className="text-lg">People</h2>
        <div className="w-full sm:w-64">
          <Field
            label=""
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search people"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-[14px] text-danger">
          {error instanceof ApiError ? error.displayMessage : 'Could not update user.'}
        </p>
      )}

      {isLoading ? (
        <div className="p-4">
          <SkeletonRows rows={4} />
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {data?.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">
                  {user.profile?.displayName ?? '—'}
                  {!user.isActive && (
                    <span className="ml-2 text-[12px] text-danger">deactivated</span>
                  )}
                  {!user.emailVerified && (
                    <span className="ml-2 text-[12px] text-warn">unverified</span>
                  )}
                </p>
                <p className="truncate text-[13px] text-ink-faint">{user.email}</p>
              </div>

              <label className="sr-only" htmlFor={`role-${user.id}`}>
                Role for {user.email}
              </label>
              <select
                id={`role-${user.id}`}
                value={user.role}
                disabled={setRole.isPending}
                onChange={(e) => setRole.mutate({ id: user.id, role: e.target.value as Role })}
                className={cn(
                  'h-9 rounded-lg border border-line bg-surface-1 px-2.5 text-[13px] text-ink',
                  'focus:border-brand focus:outline-none',
                )}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>

              <Button
                size="sm"
                variant={user.isActive ? 'danger' : 'secondary'}
                loading={setActive.isPending}
                onClick={() => setActive.mutate({ id: user.id, isActive: !user.isActive })}
              >
                {user.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api<AuditEntry[]>('/admin/audit?limit=50'),
  });

  if (isLoading) return <SkeletonRows rows={5} />;

  return (
    <section className="panel hairline overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="text-lg">Audit log</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">Most recent 50 privileged actions.</p>
      </div>

      {!data || data.length === 0 ? (
        <p className="p-6 text-center text-[14px] text-ink-dim">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {data.map((entry) => (
            <li key={entry.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-[13px] text-brand-bright">{entry.action}</span>
                <span className="tabular text-[12px] text-ink-faint">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-ink-dim">
                {entry.actor?.email ?? 'system'}
                {entry.ipAddress && <span className="text-ink-faint"> · {entry.ipAddress}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SystemPage() {
  return (
    <AuthGate requireSuperAdmin>
      <Shell>
        <header className="mb-6">
          <h1 className="text-3xl">System</h1>
          <p className="mt-1.5 text-[15px] text-ink-dim">
            People, roles, audit trail and dependency health.
          </p>
        </header>

        <div className="space-y-5">
          <HealthPanel />
          <PeoplePanel />
          <AuditPanel />
        </div>
      </Shell>
    </AuthGate>
  );
}
