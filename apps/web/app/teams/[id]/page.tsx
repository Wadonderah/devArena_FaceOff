'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/hooks';
import type { Team, TeamMemberSummary } from '@/lib/types';
import { cn } from '@/lib/cn';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.displayMessage : fallback;

function MemberRow({
  member,
  team,
  isCaptain,
  meId,
  onRemove,
  onPromote,
  promoting,
}: {
  member: TeamMemberSummary;
  team: Team;
  isCaptain: boolean;
  meId?: string;
  onRemove: (member: TeamMemberSummary) => void;
  onPromote: (member: TeamMemberSummary) => void;
  promoting: boolean;
}) {
  const name = member.user.profile?.displayName ?? 'Participant';
  const isTheCaptain = member.userId === team.captainId;
  const isMe = member.userId === meId;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full border text-[13px] font-medium',
          isTheCaptain
            ? 'border-brand/50 bg-brand/15 text-brand-bright'
            : 'border-line bg-surface-2 text-ink-dim',
        )}
      >
        {initials(name)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">
          {name}
          {isMe && (
            <span className="ml-2 rounded bg-brand/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brand-bright">
              You
            </span>
          )}
        </p>
        {member.user.profile?.country && (
          <p className="text-[13px] text-ink-faint">{member.user.profile.country}</p>
        )}
      </div>

      {isTheCaptain && <Badge tone="brand">Captain</Badge>}

      {isCaptain && !isTheCaptain && (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" loading={promoting} onClick={() => onPromote(member)}>
            Make captain
          </Button>
          <Button size="sm" variant="danger" onClick={() => onRemove(member)}>
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

function TeamView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: me } = useCurrentUser();

  const [copied, setCopied] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<TeamMemberSummary | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDisband, setConfirmDisband] = useState(false);

  const { data: team, isLoading, error } = useQuery({
    queryKey: ['team', id],
    queryFn: () => api<Team>(`/teams/${id}`),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['team', id] });
    queryClient.invalidateQueries({ queryKey: ['my-team'] });
  };

  const leave = useMutation({
    mutationFn: () => api<{ disbanded: boolean }>(`/teams/${id}/leave`, { method: 'POST' }),
    onSuccess: (result) => {
      toast.success(
        result.disbanded ? 'Team disbanded' : 'You left the team',
        result.disbanded ? 'You were the last member.' : 'You can now join or create another.',
      );
      setConfirmLeave(false);

      // Same reason as disband: a lone captain's "Disband team" button routes
      // through here, so without this the competition page still lists a team
      // that no longer exists.
      const competitionId = team?.competitionId;
      queryClient.removeQueries({ queryKey: ['team', id] });
      queryClient.invalidateQueries({ queryKey: ['my-team'] });
      if (competitionId) {
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] });
        queryClient.invalidateQueries({ queryKey: ['teams', competitionId] });
        queryClient.invalidateQueries({ queryKey: ['leaderboard-teams', competitionId] });
      }

      router.push(competitionId ? `/competitions/${competitionId}` : '/dashboard');
    },
    onError: (err) => {
      setConfirmLeave(false);
      toast.error('Could not leave the team', message(err, 'Please try again.'));
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api(`/teams/${id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: (_data, userId) => {
      const name =
        team?.members.find((m) => m.userId === userId)?.user.profile?.displayName ?? 'Member';
      toast.success(`${name} removed from the team`);
      setPendingRemoval(null);
      refresh();
    },
    onError: (err) => {
      setPendingRemoval(null);
      toast.error('Could not remove that member', message(err, 'Please try again.'));
    },
  });

  const transfer = useMutation({
    mutationFn: (userId: string) =>
      api(`/teams/${id}/captain`, { method: 'POST', body: { userId } }),
    onSuccess: (_data, userId) => {
      const name =
        team?.members.find((m) => m.userId === userId)?.user.profile?.displayName ?? 'Member';
      toast.success(`${name} is now captain`, 'You are still a member of the team.');
      refresh();
    },
    onError: (err) => toast.error('Could not transfer captaincy', message(err, 'Please try again.')),
  });

  const disband = useMutation({
    mutationFn: () => api(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Team disbanded', 'Everyone keeps the points they earned.');

      // Invalidate BEFORE navigating, or the competition page renders a cached
      // team that no longer exists — which looked like "you must refresh to see
      // it is gone". The team query is removed rather than refetched: refetching
      // a deleted team just 404s.
      const competitionId = team?.competitionId;
      queryClient.removeQueries({ queryKey: ['team', id] });
      queryClient.invalidateQueries({ queryKey: ['my-team'] });
      if (competitionId) {
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] });
        queryClient.invalidateQueries({ queryKey: ['teams', competitionId] });
        queryClient.invalidateQueries({ queryKey: ['leaderboard-teams', competitionId] });
      }

      router.push(competitionId ? `/competitions/${competitionId}` : '/dashboard');
    },
    onError: (err) => toast.error('Could not disband the team', message(err, 'Please try again.')),
  });

  if (isLoading) return <SkeletonRows rows={4} />;

  if (error) {
    return (
      <div className="panel p-6 sm:p-10 text-center">
        <h1 className="text-lg">Team unavailable</h1>
        <p className="mt-2 text-[14px] text-ink-dim">{message(error, 'Please try again.')}</p>
        <Link href="/dashboard" className="mt-5 inline-block">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  if (!team) return null;

  const isCaptain = team.captainId === me?.id;
  const isMember = team.members.some((m) => m.userId === me?.id);

  return (
    <>
      <PageHeader
        title={team.name}
        badge={isCaptain ? <Badge tone="brand">You captain this team</Badge> : undefined}
        subtitle={`${team.members.length} ${team.members.length === 1 ? 'member' : 'members'}`}
        actions={
          <>
            <Link href={`/leaderboard/${team.competitionId}`}>
              <Button variant="secondary">Leaderboard</Button>
            </Link>
            {/* A lone captain leaving IS a disband, so say so — searching for
                "delete" and finding only "leave" reads as no option at all. */}
            {isMember && isCaptain && team.members.length === 1 && (
              <Button variant="danger" onClick={() => setConfirmLeave(true)}>
                Disband team
              </Button>
            )}

            {/* A captain with members gets both: step out, or end the team. */}
            {isMember && isCaptain && team.members.length > 1 && (
              <>
                <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
                  Leave team
                </Button>
                <Button variant="danger" onClick={() => setConfirmDisband(true)}>
                  Disband team
                </Button>
              </>
            )}

              {isMember && !isCaptain && (
                <Button variant="danger" onClick={() => setConfirmLeave(true)}>
                  Leave team
                </Button>
              )}
          </>
        }
      />

      {isMember && team.code && (
        <section className="panel hairline bracketed mb-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Invite code
            </p>
            <p className="mt-1.5 font-mono text-3xl tracking-[0.24em]">{team.code}</p>
            <p className="mt-1.5 text-[13px] text-ink-faint">
              Share this so others can join. Case and spacing do not matter.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(team.code!);
              setCopied(true);
              toast.success('Invite code copied');
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </section>
      )}

      <section className="panel hairline overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Roster
        </h2>
        <ul className="divide-y divide-line/60">
          {team.members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              team={team}
              isCaptain={isCaptain}
              meId={me?.id}
              promoting={transfer.isPending}
              onRemove={setPendingRemoval}
              onPromote={(m) => transfer.mutate(m.userId)}
            />
          ))}
        </ul>
      </section>

      {isCaptain && team.members.length > 1 && (
        <p className="mt-4 text-[13px] text-ink-faint">
          As captain you must hand over captaincy before you can leave, so the team is never left
          without one.
        </p>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this member?"
        description={`${
          pendingRemoval?.user.profile?.displayName ?? 'This participant'
        } will be removed from ${team.name}. Any points they have already scored stay on the leaderboard, and they can join another team afterwards.`}
        confirmLabel="Remove member"
        loading={removeMember.isPending}
        onConfirm={() => pendingRemoval && removeMember.mutate(pendingRemoval.userId)}
        onCancel={() => setPendingRemoval(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={team.members.length === 1 ? `Disband ${team.name}?` : 'Leave this team?'}
        description={
          team.members.length === 1
            ? `You are the last member, so the team will be removed. Points you have already scored are kept.`
            : `You will leave ${team.name}. Points you have already scored are kept, and you can join another team afterwards.`
        }
        confirmLabel={team.members.length === 1 ? 'Disband team' : 'Leave team'}
        loading={leave.isPending}
        onConfirm={() => leave.mutate()}
        onCancel={() => setConfirmLeave(false)}
      />

      <ConfirmDialog
        open={confirmDisband}
        title={`Disband ${team.name}?`}
        description={`This removes the team and its ${team.members.length} members. Everyone keeps the points they have already scored — only the team itself goes.`}
        confirmLabel="Disband team"
        loading={disband.isPending}
        onConfirm={() => disband.mutate()}
        onCancel={() => setConfirmDisband(false)}
      />
    </>
  );
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Shell>
        <TeamView id={id} />
      </Shell>
    </AuthGate>
  );
}
