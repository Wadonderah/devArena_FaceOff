'use client';

import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { CompetitionStateBadge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useCompetitions } from '@/lib/hooks';

function CompetitionsList() {
  const { data, isLoading } = useCompetitions();

  if (isLoading) return <SkeletonRows rows={3} />;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">Competitions</h1>
      </header>

      {!data || data.length === 0 ? (
        <div className="panel p-10 text-center text-[14px] text-ink-dim">
          No competitions are published yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((competition) => (
            <li key={competition.id}>
              <Link
                href={`/competitions/${competition.id}`}
                className="panel hairline flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-line-bright"
              >
                <div>
                  <h2 className="text-lg">{competition.name}</h2>
                  {competition.description && (
                    <p className="mt-1 max-w-xl text-[14px] text-ink-dim">
                      {competition.description}
                    </p>
                  )}
                </div>
                <CompetitionStateBadge state={competition.state} />
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
