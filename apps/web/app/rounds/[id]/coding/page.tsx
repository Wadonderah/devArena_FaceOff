'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { use, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { CodeEditor } from '@/components/code-editor';
import { Button } from '@/components/ui/button';
import { Badge, RoundStateBadge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useCountdown, useRound, useSubmission } from '@/lib/hooks';
import type { Challenge, Language, RunResult } from '@/lib/types';
import { cn } from '@/lib/cn';

function starterFor(challenge: Challenge, language: Language): string {
  const coding = challenge.codingChallenge;
  if (!coding) return '';
  return (language === 'PYTHON' ? coding.starterCodePy : coding.starterCodeJs) ?? '';
}

function OutcomePill({ passed, label }: { passed: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium',
        passed ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
      )}
    >
      <span aria-hidden>{passed ? '✓' : '✕'}</span>
      {label}
    </span>
  );
}

function SubmissionPanel({ submissionId }: { submissionId: string }) {
  const { data } = useSubmission(submissionId);

  if (!data) return <Skeleton className="h-24 w-full rounded-xl" />;

  const pending = data.status === 'QUEUED' || data.status === 'RUNNING';

  if (pending) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3.5">
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-brand border-r-transparent"
        />
        <p aria-live="polite" className="text-[14px] text-ink-dim">
          {data.status === 'QUEUED' ? 'Queued for grading…' : 'Running your code…'}
        </p>
      </div>
    );
  }

  if (data.status === 'SYSTEM_ERROR') {
    return (
      <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3.5">
        <p className="text-[14px] text-warn">{data.errorMessage}</p>
      </div>
    );
  }

  const passed = data.passedTests ?? 0;
  const total = data.totalTests ?? 0;
  const allPassed = total > 0 && passed === total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="panel hairline overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Badge tone={allPassed ? 'success' : 'warn'}>
            {passed} / {total} tests passed
          </Badge>
          {data.rawScore && (
            <span className="text-[14px] text-ink-dim">
              {Number(data.rawScore)} / {data.challenge.points} pts
            </span>
          )}
        </div>
        {data.executionMs !== null && (
          <span className="tabular font-mono text-[13px] text-ink-faint">
            {data.executionMs} ms
          </span>
        )}
      </div>

      {data.compileOutput && (
        <pre className="max-h-48 overflow-auto border-b border-line bg-surface-0 p-4 font-mono text-[12px] leading-relaxed text-danger">
          <code>{data.compileOutput}</code>
        </pre>
      )}

      <ul className="divide-y divide-line/60">
        {data.results.map((result, index) => (
          <li key={result.testCaseId} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-[14px] text-ink-dim">
              {result.hidden ? `Hidden test ${index + 1}` : `Sample test ${index + 1}`}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-faint">{result.message}</span>
              <OutcomePill passed={result.passed} label={result.passed ? 'Pass' : 'Fail'} />
            </div>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function RunResults({ results }: { results: RunResult[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="panel hairline divide-y divide-line/60"
    >
      {results.map((result, index) => (
        <div key={result.testCaseId} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px]">Sample test {index + 1}</span>
            <OutcomePill passed={result.passed} label={result.message} />
          </div>

          <dl className="mt-3 grid gap-2 font-mono text-[12px] sm:grid-cols-3">
            {[
              ['Input', result.stdin],
              ['Expected', result.expectedOutput],
              ['Yours', result.actualOutput ?? '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">
                  {label}
                </dt>
                <dd className="overflow-x-auto whitespace-pre rounded-md border border-line bg-surface-0 px-2.5 py-1.5">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {(result.stderr || result.compileOutput) && (
            <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-danger/30 bg-danger/5 p-3 font-mono text-[12px] text-danger">
              <code>{result.compileOutput ?? result.stderr}</code>
            </pre>
          )}
        </div>
      ))}
    </motion.div>
  );
}

function Problem({
  roundId,
  challengeId,
  languages,
}: {
  roundId: string;
  challengeId: string;
  languages: Language[];
}) {
  const [language, setLanguage] = useState<Language>(languages[0] ?? 'PYTHON');
  const [code, setCode] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const queryClient = useQueryClient();

  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId, roundId],
    queryFn: () => api<Challenge>(`/challenges/${challengeId}/in-round/${roundId}`),
    retry: false,
  });

  // Seed the editor from starter code when the challenge loads or the language
  // changes, without clobbering work already typed for the same language.
  useEffect(() => {
    if (challenge) setCode(starterFor(challenge, language));
  }, [challenge, language]);

  const run = useMutation({
    mutationFn: () =>
      api<{ results: RunResult[] }>('/submissions/code/run', {
        method: 'POST',
        body: { roundId, challengeId, language, sourceCode: code },
      }),
    onSuccess: (data) => {
      setRunResults(data.results);
      setSubmissionId(null);
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/submissions/code', {
        method: 'POST',
        body: { roundId, challengeId, language, sourceCode: code },
      }),
    onSuccess: (data) => {
      setSubmissionId(data.id);
      setRunResults(null);
      queryClient.invalidateQueries({ queryKey: ['my-submissions', roundId] });
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-[14px]" />;
  if (!challenge?.codingChallenge) return null;

  const coding = challenge.codingChallenge;
  const busy = run.isPending || submit.isPending;
  const error = run.error ?? submit.error;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="panel hairline max-h-[calc(100dvh-9rem)] overflow-y-auto p-6 lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl">{challenge.title}</h2>
          <span className="shrink-0 text-[13px] text-ink-faint">{challenge.points} pts</span>
        </div>

        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-dim">
          {coding.statement}
        </p>

        {coding.constraints && (
          <>
            <h3 className="mt-5 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
              Constraints
            </h3>
            <p className="mt-1.5 whitespace-pre-wrap text-[14px] text-ink-dim">
              {coding.constraints}
            </p>
          </>
        )}

        {coding.testCases.length > 0 && (
          <>
            <h3 className="mt-5 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
              Sample tests
            </h3>
            <ul className="mt-2 space-y-2">
              {coding.testCases.map((tc) => (
                <li key={tc.id} className="rounded-lg border border-line bg-surface-0 p-3 font-mono text-[12px]">
                  <p className="text-ink-faint">input</p>
                  <p className="mt-0.5 whitespace-pre">{tc.stdin}</p>
                  <p className="mt-2 text-ink-faint">expected</p>
                  <p className="mt-0.5 whitespace-pre">{tc.expectedOutput}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-faint">
              Your submission is also graded against hidden tests you cannot see.
            </p>
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Language"
            className="inline-flex rounded-lg border border-line bg-surface-1 p-0.5"
          >
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={language === lang}
                onClick={() => setLanguage(lang)}
                className={cn(
                  'rounded-[7px] px-3 py-1.5 text-[13px] transition-colors duration-150',
                  language === lang
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-dim hover:text-ink',
                )}
              >
                {lang === 'PYTHON' ? 'Python' : 'JavaScript'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" loading={run.isPending} disabled={busy} onClick={() => run.mutate()}>
              Run
            </Button>
            <Button loading={submit.isPending} disabled={busy} onClick={() => submit.mutate()}>
              Submit
            </Button>
          </div>
        </div>

        <CodeEditor value={code} language={language} onChange={setCode} readOnly={busy} />

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
            {error instanceof ApiError ? error.displayMessage : 'Something went wrong.'}
          </p>
        )}

        <AnimatePresence mode="wait">
          {submissionId && <SubmissionPanel key={submissionId} submissionId={submissionId} />}
          {runResults && <RunResults key="run" results={runResults} />}
        </AnimatePresence>
      </section>
    </div>
  );
}

function CodingRound({ roundId }: { roundId: string }) {
  const { data: round, isLoading, error } = useRound(roundId);
  const { label, remainingMs } = useCountdown(round?.state === 'LIVE' ? round.endsAt : null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: ids } = useQuery({
    queryKey: ['round-question-ids', roundId],
    queryFn: () => api<{ challengeIds: string[] }>(`/rounds/${roundId}/challenge-ids`),
    retry: false,
  });

  useEffect(() => {
    if (ids && ids.challengeIds.length > 0 && !activeId) setActiveId(ids.challengeIds[0]);
  }, [ids, activeId]);

  if (isLoading) return <SkeletonRows rows={4} />;

  if (error) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="text-lg">Round unavailable</h1>
        <p className="mt-2 text-[14px] text-ink-dim">
          {error instanceof ApiError ? error.displayMessage : 'Please try again.'}
        </p>
      </div>
    );
  }

  if (!round) return null;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl">{round.name}</h1>
            <RoundStateBadge state={round.state} />
          </div>
        </div>

        {remainingMs !== null && remainingMs > 0 && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Time left</p>
            <p aria-hidden className="tabular font-mono text-2xl text-live">{label}</p>
          </div>
        )}
      </header>

      {ids && ids.challengeIds.length > 1 && (
        <nav aria-label="Problems" className="mb-5 flex flex-wrap gap-2">
          {ids.challengeIds.map((id, index) => (
            <button
              key={id}
              type="button"
              aria-current={activeId === id ? 'true' : undefined}
              onClick={() => setActiveId(id)}
              className={cn(
                'rounded-lg border px-3.5 py-1.5 text-[13px] transition-colors duration-150',
                activeId === id
                  ? 'border-brand bg-brand/10 text-ink'
                  : 'border-line bg-surface-1 text-ink-dim hover:border-line-bright hover:text-ink',
              )}
            >
              Problem {index + 1}
            </button>
          ))}
        </nav>
      )}

      {activeId && (
        <Problem
          key={activeId}
          roundId={roundId}
          challengeId={activeId}
          languages={round.allowedLanguages.length > 0 ? round.allowedLanguages : ['PYTHON']}
        />
      )}
    </>
  );
}

export default function CodingRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Shell>
        <CodingRound roundId={id} />
      </Shell>
    </AuthGate>
  );
}
