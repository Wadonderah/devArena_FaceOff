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

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
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

/// Groups competitions by what a participant can actually do with them.
///
/// The previous dashboard surfaced one competition — the first LIVE or
/// REGISTRATION match — and dropped the rest into an unlabelled list of names.
/// With more than one season open, or a live competition sitting behind one
/// taking registrations, that hid the thing the participant came for.
function groupByState(competitions: CompetitionListItem[]) {
  return {
    live: competitions.filter((c) => c.state === 'LIVE'),
    open: competitions.filter((c) => c.state === 'REGISTRATION'),
    past: competitions.filter((c) => c.state === 'COMPLETED' || c.state === 'ARCHIVED'),
  };
}

function Section({
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: typeof Radio;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="mb-3.5">
        <h2 className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-faint">
          <Icon aria-hidden size={14} strokeWidth={1.5} />
          {title}
        </h2>
        {/* Every section says what it is for. "Open for registration" is
            obvious to whoever built it and not to a first-time participant. */}
        <p className="mt-1 text-[13px] text-ink-faint">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function DashboardContent() {
  const { data: profile } = useProfile();
  const { data: competitions, isLoading } = useCompetitions();

  const grouped = groupByState(competitions ?? []);

  // The one that gets the detailed panel: live beats merely open.
  const focus = grouped.live[0] ?? grouped.open[0] ?? null;

  // ...and it is then excluded from the lists below, so it is not shown twice
  // in two different shapes on the same screen.
  const live = grouped.live.filter((c) => c.id !== focus?.id);
  const open = grouped.open.filter((c) => c.id !== focus?.id);
  const past = grouped.past;
  const hasAny = (competitions?.length ?? 0) > 0;

  return (
    <>
      <VerifyBanner />

      <header className="mb-2">
        <h1 className="text-3xl">
          {profile?.profile?.displayName
            ? `Welcome back, ${profile.profile.displayName.split(' ')[0]}`
            : 'Dashboard'}
        </h1>
        <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-ink-dim">
          Everything you can take part in right now. A competition runs in timed rounds: answer
          multiple-choice questions, write code against hidden tests, then fix a broken program.
        </p>
      </header>

      {isLoading ? (
        <div className="mt-8">
          <SkeletonRows rows={3} />
        </div>
      ) : !hasAny ? (
        <div className="panel mt-8 p-10 text-center">
          <h2 className="text-lg">Nothing running yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-dim">
            No competition has opened. When an organizer starts the next season it appears here,
            and you will be able to join from this page.
          </p>
        </div>
      ) : (
        <>
          {/* The one you are most likely here for keeps the detailed panel:
              your team, and the round that is open or next. */}
          {focus && (
            <div className="mt-8 space-y-4">
              <TeamCard competitionId={focus.id} />
              <CurrentCompetition id={focus.id} />
            </div>
          )}

          {live.length > 0 && (
            <Section
              icon={Radio}
              title={`Also live · ${live.length}`}
              blurb="Rounds are running in these too. Scores are recorded as people submit."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {live.map((c) => (
                  <CompetitionCard key={c.id} competition={c} />
                ))}
              </div>
            </Section>
          )}

          {open.length > 0 && (
            <Section
              icon={LayoutList}
              title={open.length === 1 ? 'Open for registration' : `Open for registration · ${open.length}`}
              blurb="Not started yet. Join now and form a team before the first round opens."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {open.map((c) => (
                  <CompetitionCard key={c.id} competition={c} />
                ))}
              </div>
            </Section>
          )}

          {past.length > 0 && (
            <Section
              icon={Trophy}
              title="Finished"
              blurb="Closed to new submissions. Final standings are still readable."
            >
              <ul className="space-y-2">
                {past.map((c) => (
                  <li key={c.id}>
                    <CompetitionRow competition={c} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
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