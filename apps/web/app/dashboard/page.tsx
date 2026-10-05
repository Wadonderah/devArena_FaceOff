'use client';

import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { RoundStateBadge, CompetitionStateBadge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TeamCard } from '@/components/team-card';
import { VerifyBanner } from '@/components/verify-banner';
import { useCompetitions, useProfile } from '@/lib/hooks';
import { useCompetition } from '@/lib/hooks';
import { ROUND_PATH } from '@/lib/taxonomy';
import { ArrowRight, CalendarClock, LayoutList, Radio, Trophy } from 'lucide-react';

function CurrentCompetition({ id }: { id: string }) {
  const { data, isLoading } = useCompetition(id);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-[14px]" />;
  if (!data) return null;

  const live = data.rounds.find((r) => r.state === 'LIVE');
  const next = data.rounds.find((r) => r.state === 'SCHEDULED');
  const focus = live ?? next;

  return (
    <section className="panel hairline overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl">{data.name}</h2>
            <CompetitionStateBadge state={data.state} />
          </div>
          {data.description && (
            <p className="mt-1.5 max-w-lg text-[14px] text-ink-dim">{data.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/leaderboard/${data.id}`}>
            <Button variant="secondary" size="sm">Leaderboard</Button>
          </Link>
          <Link href={`/competitions/${data.id}`}>
            <Button size="sm" icon={<ArrowRight />}>Open</Button>
          </Link>
        </div>
      </div>

      <div className="p-6">
        <p className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
          {live ? (
            <Radio aria-hidden size={14} strokeWidth={1.5} className="text-live" />
          ) : (
            <CalendarClock aria-hidden size={14} strokeWidth={1.5} />
          )}
          {live ? 'Happening now' : next ? 'Up next' : 'Rounds'}
        </p>

        {focus ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg">{focus.name}</h3>
                <RoundStateBadge state={focus.state} />
              </div>
              <p className="mt-1 text-[14px] text-ink-faint">
                {focus._count.challenges}{' '}
                {focus.type === 'MCQ' ? 'questions' : 'problems'}
              </p>
            </div>

            {focus.state === 'LIVE' && data.joined && (
              <Link href={`/rounds/${focus.id}/${ROUND_PATH[focus.type]}`}>
                <Button>Enter round</Button>
              </Link>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-ink-dim">No rounds are open right now.</p>
        )}
      </div>
    </section>
  );
}

function DashboardContent() {
  const { data: profile } = useProfile();
  const { data: competitions, isLoading } = useCompetitions();

  const active = competitions?.find(
    (c) => c.state === 'LIVE' || c.state === 'REGISTRATION',
  );

  return (
    <>
      <VerifyBanner />

      <header className="mb-8">
        <h1 className="text-3xl">
          {profile?.profile?.displayName
            ? `Welcome back, ${profile.profile.displayName.split(' ')[0]}`
            : 'Dashboard'}
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-dim">
          Your current round, your rank, and what to do next.
        </p>
      </header>

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : active ? (
        <div className="space-y-4">
          <TeamCard competitionId={active.id} />
          <CurrentCompetition id={active.id} />
        </div>
      ) : (
        <div className="panel p-10 text-center">
          <h2 className="text-lg">No active competition</h2>
          <p className="mt-2 text-[14px] text-ink-dim">
            Nothing is running right now. Check back when the organizer opens the next season.
          </p>
        </div>
      )}

      {competitions && competitions.length > 1 && (
        <section className="mt-10">
          <h2 className="mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
            <LayoutList aria-hidden size={14} strokeWidth={1.5} />
            All competitions
          </h2>
          <ul className="space-y-2">
            {competitions.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/competitions/${c.id}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface-1 px-4 py-3 transition-colors hover:border-line-bright hover:bg-surface-2"
                >
                  <span className="inline-flex items-center gap-2.5 text-[15px]">
                    <Trophy aria-hidden size={15} strokeWidth={1.5} className="text-ink-faint" />
                    {c.name}
                  </span>
                  <CompetitionStateBadge state={c.state} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <Shell>
        <DashboardContent />
      </Shell>
    </AuthGate>
  );
}