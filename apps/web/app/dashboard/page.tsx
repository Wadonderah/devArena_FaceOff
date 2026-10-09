'use client';

import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { RoundStateBadge, CompetitionStateBadge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TeamCard } from '@/components/team-card';
import { VerifyBanner } from '@/components/verify-banner';
import { ProfileHeader } from '@/components/profile-header';
import { CompetitionCard, CompetitionRow } from '@/components/competition-card';
import { FaceOffRule } from '@/components/brand-mark';
import { Section } from '@/components/ui/section';
import { useCompetition, useCompetitions } from '@/lib/hooks';
import { ROUND_PATH } from '@/lib/taxonomy';
import { ArrowRight, CalendarClock, LayoutList, Radio, Trophy } from 'lucide-react';
import type { CompetitionListItem } from '@/lib/types';
import { cn } from '@/lib/cn';

/// The competition a participant is most likely here for, as the first thing on
/// the page.
///
/// It used to be third, below a greeting set at `text-3xl` and a paragraph
/// explaining what a competition is. Both of those are read once; this is read
/// every day, and during an event it is the only reason anyone opens the page.
/// The explanation now lives in the empty state, which is the only place it is
/// ever actually needed.
function CurrentCompetition({ id }: { id: string }) {
  const { data, isLoading } = useCompetition(id);

  if (isLoading) return <Skeleton className="h-52 w-full rounded-xl" />;
  if (!data) return null;

  const live = data.rounds.find((r) => r.state === 'LIVE');
  const next = data.rounds.find((r) => r.state === 'SCHEDULED');
  const focus = live ?? next;
  const isLive = Boolean(live);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        // A live round earns a warmer edge. Still a border, not a badge.
        isLive ? 'border-live/25' : 'border-line',
      )}
    >
      <FaceOffRule live={isLive} />

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5 p-4 sm:gap-y-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {/* The page's visual anchor, and the only large type on it. */}
            <h2 className="text-2xl leading-tight">{data.name}</h2>
            <CompetitionStateBadge state={data.state} />
          </div>
          {/* Clamped to two lines on a phone. A three-sentence description was
              pushing the round — the row that matters during an event — most of
              the way off a 390px screen. The full text is one tap away on the
              competition page. */}
          {data.description && (
            <p className="mt-2 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-ink-dim sm:line-clamp-none sm:text-[14px]">
              {data.description}
            </p>
          )}
        </div>

        {/* Full width on a phone, so the two buttons share one line below the
            title instead of being crushed beside it. */}
        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <Link href={`/leaderboard/${data.id}`} className="flex-1 sm:flex-none">
            <Button variant="secondary" size="sm" className="w-full">
              Standings
            </Button>
          </Link>
          <Link href={`/competitions/${data.id}`} className="flex-1 sm:flex-none">
            <Button variant="secondary" size="sm" icon={<ArrowRight />} className="w-full">
              Open
            </Button>
          </Link>
        </div>
      </div>

      {/* The round, on its own ground rather than as another paragraph in the
          same block — during an event this is the only row that matters. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-4 py-3.5 sm:px-6 sm:py-4',
          isLive ? 'border-live/20 bg-live/[0.04]' : 'border-line bg-surface-2/30',
        )}
      >
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {isLive ? (
              <Radio aria-hidden size={13} strokeWidth={1.75} className="text-live" />
            ) : (
              <CalendarClock aria-hidden size={13} strokeWidth={1.5} />
            )}
            {isLive ? 'Happening now' : next ? 'Up next' : 'Rounds'}
          </p>

          {focus ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="text-[15px] font-medium text-ink">{focus.name}</h3>
              <RoundStateBadge state={focus.state} />
              <span className="text-[13px] text-ink-faint">
                {focus._count.challenges} {focus.type === 'MCQ' ? 'questions' : 'problems'}
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-[14px] text-ink-dim">No rounds are open right now.</p>
          )}
        </div>

        {/* Full width on a phone: it is the primary action on the page during
            a round, and a 120px button floated right is both easy to miss and
            awkward to hit with a thumb. */}
        {focus?.state === 'LIVE' && data.joined && (
          <Link href={`/rounds/${focus.id}/${ROUND_PATH[focus.type]}`} className="w-full sm:w-auto">
            <Button icon={<ArrowRight />} className="w-full">
              Enter round
            </Button>
          </Link>
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

function DashboardContent() {
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

      {/* Identity, then straight into the competition. The strip is deliberately
          small: it answers "am I signed in as the right person", which is a
          glance, not a headline. */}
      <ProfileHeader className="mb-5" />

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : !hasAny ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface-1">
          <FaceOffRule />
          <div className="p-6 text-center sm:p-10">
            <h2 className="text-lg">Nothing running yet</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-dim">
              No competition has opened. When an organizer starts the next season it appears
              here, and you will be able to join from this page.
            </p>
            {/* The explanation of what a competition is, in the one place it is
                actually useful: a screen with nothing else on it. On a populated
                dashboard it pushed the live round below the fold. */}
            <p className="mx-auto mt-4 max-w-md border-t border-line pt-4 text-[13px] leading-relaxed text-ink-faint">
              A competition runs in timed rounds: answer multiple-choice questions, write code
              against hidden tests, then fix a broken program.
            </p>
          </div>
        </div>
      ) : (
        <>
          {focus && (
            <div className="space-y-4">
              <CurrentCompetition id={focus.id} />
              {/* Beneath, not above. A team is a detail of the competition, and
                  it used to sit on top of the thing it belongs to. */}
              <TeamCard competitionId={focus.id} />
            </div>
          )}

          {live.length > 0 && (
            <Section
              icon={Radio}
              tone="live"
              title="Also live"
              count={live.length}
              blurb="Rounds are running in these too, and scores record as people submit."
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
              title="Open for registration"
              count={open.length}
              blurb="Not started yet. Join and form a team before the first round opens."
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
              count={past.length}
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
