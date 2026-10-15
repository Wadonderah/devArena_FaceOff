'use client';

import { useCallback, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { SkeletonRows } from '@/components/ui/skeleton';
import { TeamCard } from '@/components/team-card';
import { VerifyBanner } from '@/components/verify-banner';
import { CompetitionRow } from '@/components/competition-card';
import { CompetitionCarousel } from '@/components/competition-carousel';
import { RoundSchedule } from '@/components/round-schedule';
import { StandingCard } from '@/components/standing-card';
import { LiveNow } from '@/components/live-now';
import { ActivityFeed } from '@/components/activity-feed';
import { FaceOffRule } from '@/components/brand-mark';
import { Section } from '@/components/ui/section';
import { useCompetitions } from '@/lib/hooks';
import { Trophy } from 'lucide-react';
import type { CompetitionListItem } from '@/lib/types';

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

  // Everything a participant can act on goes in the carousel, live first. The
  // sections below are then only what is left: finished competitions.
  const featured = [...grouped.live, ...grouped.open];
  const past = grouped.past;
  const hasAny = (competitions?.length ?? 0) > 0;

  // The team shown belongs to whichever slide is in view, so it keeps pace with
  // the carousel instead of being pinned to the first competition.
  const [activeId, setActiveId] = useState<string | null>(null);
  const handleActive = useCallback((c: CompetitionListItem) => setActiveId(c.id), []);
  const teamCompetitionId = activeId ?? featured[0]?.id ?? null;

  return (
    <>
      <VerifyBanner />

      {/* No avatar and no name here. Identity belongs in the chrome — the rail
          carries it on desktop, the top strip on mobile — and repeating it at
          the top of the content column is both duplication and the only thing
          on this page that is about the reader rather than the competition.
          What a page head is actually for is orientation, so that is all this
          does. */}
      <header className="mb-5 flex items-baseline justify-between gap-4">
        <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
          Dashboard
        </h1>
        {hasAny && (
          <p className="text-[12px] text-ink-faint">
            {grouped.live.length > 0 && (
              <span className="text-live">{grouped.live.length} live</span>
            )}
            {grouped.live.length > 0 && grouped.open.length > 0 && ' · '}
            {grouped.open.length > 0 && `${grouped.open.length} open`}
          </p>
        )}
      </header>

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
          {featured.length > 0 && teamCompetitionId && (
            // Two columns from lg up. Collapsing the three old sections into the
            // carousel left the page about one screen tall with a lot of air
            // under it; the rail puts the standings and the team beside the
            // competition instead of leaving the right half empty.
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              {/* Wide-format panels stay in the wide column. TeamCard lays its
                  three figures out in a row, so in a 300px rail it wrapped into
                  a tall block — which is what made the page read as oversized
                  boxes rather than as a denser layout. */}
              <div className="space-y-4">
                <CompetitionCarousel competitions={featured} onActiveChange={handleActive} />
                {/* Directly under the competition: during an event this is the
                    only panel anyone is actually reading. */}
                <LiveNow competitionId={teamCompetitionId} />
                {/* Beneath, not above. A team is a detail of the competition, and
                    it used to sit on top of the thing it belongs to. */}
                <TeamCard competitionId={teamCompetitionId} />
                <RoundSchedule competitionId={teamCompetitionId} />
              </div>

              {/* Sticky so the standings stay in view while the left column
                  scrolls — a short rail that follows reads as deliberate, where
                  a short rail that scrolls away just leaves a hole.
                  Below the fold on a phone, which is right: a participant on a
                  390px screen wants the live round first, not the standings. */}
              <aside className="space-y-4 lg:sticky lg:top-6">
                <StandingCard competitionId={teamCompetitionId} />
                <ActivityFeed />
              </aside>
            </div>
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
