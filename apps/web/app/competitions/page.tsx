'use client';

import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { CompetitionStateBadge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useCompetitions } from '@/lib/hooks';
import { ChevronRight, Trophy } from 'lucide-react';

function CompetitionsList() {
  const { data, isLoading } = useCompetitions();

  if (isLoading) return <SkeletonRows rows={3} />;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">Competitions</h1>
      </header>

      {!data || data.length === 0 ? (
        <div className="panel p-12 text-center">
          <Trophy aria-hidden size={26} strokeWidth={1.25} className="mx-auto text-ink-faint" />
          <p className="mt-3 text-[15px] text-ink-dim">No competitions are published yet.</p>
          <p className="mt-1 text-[13px] text-ink-faint">
            One will appear here as soon as an organizer opens registration.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((competition) => (
            <li key={competition.id}>
              <Link
                href={`/competitions/${competition.id}`}
                className="panel hairline flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-line-bright"
              >
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-brand-bright">
                    <Trophy aria-hidden size={16} strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                  <h2 className="text-lg">{competition.name}</h2>
                  {competition.description && (
                    <p className="mt-1 max-w-xl text-[14px] text-ink-dim">
                      {competition.description}
                    </p>
                  )}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <CompetitionStateBadge state={competition.state} />
                  <ChevronRight
                    aria-hidden
                    size={17}
                    strokeWidth={1.5}
                    className="text-ink-faint"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function CompetitionsPage() {
  return (
    <AuthGate>
      <Shell>
        <CompetitionsList />
      </Shell>
    </AuthGate>
  );
}
