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
import { useToast } from '@/components/ui/toast';
import { useCountdown, useCurrentUser, useRound, useSubmission } from '@/lib/hooks';
import { useDraft } from '@/lib/use-draft';
import { RoundRules } from '@/components/round-rules';
import { RoundClosed, RoundExitLinks, isRoundClosed } from '@/components/round-exit';
import { GradingFailed } from '@/components/grading-failed';
import { LANGUAGE_LABELS } from '@/lib/taxonomy';
import type { Challenge, Language, RunResult } from '@/lib/types';
import { cn } from '@/lib/cn';

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.displayMessage : fallback;

function Verdict({ passed, label }: { passed: boolean; label: string }) {
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

function SubmissionPanel({
  submissionId,
  onRetry,
  retrying,
}: {
  submissionId: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { data } = useSubmission(submissionId);

  if (!data) return <Skeleton className="h-24 w-full rounded-xl" />;

  if (data.status === 'QUEUED' || data.status === 'RUNNING') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3.5">
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-brand border-r-transparent"
        />
        <p aria-live="polite" className="text-[14px] text-ink-dim">
          {data.status === 'QUEUED' ? 'Queued…' : 'Running the tests against your fix…'}
        </p>
      </div>
    );
  }

  if (data.status === 'SYSTEM_ERROR') {
    return <GradingFailed onRetry={onRetry} retrying={retrying} />;
  }

  const passed = data.passedTests ?? 0;
  const total = data.totalTests ?? 0;
  const fixed = total > 0 && passed === total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="panel hairline overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Badge tone={fixed ? 'success' : 'warn'}>
            {fixed ? 'Bug fixed' : `${passed} of ${total} tests pass`}
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
              {result.hidden ? `Hidden test ${index + 1}` : `Reproduction ${index + 1}`}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-faint">{result.message}</span>
              <Verdict passed={result.passed} label={result.passed ? 'Pass' : 'Fail'} />
            </div>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function DebuggingWorkspace({
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
  const [seeded, setSeeded] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId, roundId],
    queryFn: () => api<Challenge>(`/challenges/${challengeId}/in-round/${roundId}`),
    retry: false,
  });

  const bug = challenge?.debuggingChallenge;

  const { data: me } = useCurrentUser();

  const draft = useDraft({
    userId: me?.id,
    challengeId,
    language,
    value: code,
    ready: seeded,
  });

  // Reset to the broken code when the challenge loads or the language changes.
  // Starting from a blank editor would defeat the point — the participant is
  // meant to read and repair this, not rewrite it.
  //
  // A saved draft takes precedence, because a half-finished repair is worth
  // more than the untouched original the participant can already see described
  // in the bug report.
  useEffect(() => {
    if (!bug) return;

    setSeeded(false);
    const saved = draft.restore();
    setCode(saved ?? bug.brokenCode[language] ?? '');
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bug, language, me?.id]);

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
      // Grading is asynchronous, so without this the button just stops spinning
      // and nothing visibly happens until the poll returns a verdict.
      toast.success('Submitted for grading', 'Your result appears below when the judge finishes.');
      draft.clear();
      setSubmissionId(data.id);
      setRunResults(null);
      queryClient.invalidateQueries({ queryKey: ['my-submissions', roundId] });
    },
    onError: (error) =>
      toast.error(
        'Submission refused',
        error instanceof ApiError ? error.displayMessage : undefined,
      ),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!bug) return null;

  const busy = run.isPending || submit.isPending;
  const error = run.error ?? submit.error;
  const contextFiles = Object.entries(bug.contextFiles ?? {});

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* Desktop-only scroll container, matching the coding round.
          
          Stacked on a phone this created a nested scroll area: flicking inside
          moved the bug report, flicking just outside moved the page, and
          reaching the editor meant scrolling the whole report first. */}
      <section className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
        <div className="panel hairline bracketed p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-live">
            Bug report
          </p>
          <h2 className="mt-2 text-lg">{challenge.title}</h2>
          <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-dim">
            {bug.bugReport}
          </p>
        </div>

        {/* The failing output is the evidence. Without it this would just be a
            coding problem with unusually messy starter code. */}
        <div className="panel hairline overflow-hidden">
          <p className="border-b border-line bg-surface-1/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            Failing output
          </p>
          <pre className="max-h-64 overflow-auto bg-surface-0 p-4 font-mono text-[12px] leading-relaxed text-danger">
            <code>{bug.failingTestOutput}</code>
          </pre>
        </div>

        {contextFiles.length > 0 && (
          <div className="panel hairline overflow-hidden">
            <p className="border-b border-line bg-surface-1/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Supporting files · read only
            </p>
            {contextFiles.map(([name, content]) => (
              <details key={name} className="border-b border-line/60 last:border-0">
                <summary className="cursor-pointer px-4 py-2.5 font-mono text-[13px] text-ink-dim hover:text-ink">
                  {name}
                </summary>
                <pre className="max-h-56 overflow-auto bg-surface-0 p-4 font-mono text-[12px] leading-relaxed">
                  <code>{content}</code>
                </pre>
              </details>
            ))}
          </div>
        )}

        {bug.testCases.length > 0 && (
          <div className="panel hairline p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Reproduction
            </p>
            <ul className="mt-2.5 space-y-2">
              {bug.testCases.map((tc) => (
                <li key={tc.id} className="rounded-lg border border-line bg-surface-0 p-3 font-mono text-[12px]">
                  <p className="text-ink-faint">input</p>
                  <p className="mt-0.5 whitespace-pre">{tc.stdin}</p>
                  <p className="mt-2 text-ink-faint">should produce</p>
                  <p className="mt-0.5 whitespace-pre">{tc.expectedOutput}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-faint">
              Hidden tests also run against your fix, so repairing only this case will not be
              enough.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Language"
            className="inline-flex flex-wrap rounded-lg border border-line bg-surface-1 p-0.5"
          >
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={language === lang}
                onClick={() => setLanguage(lang)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150',
                  language === lang ? 'bg-surface-3 text-ink' : 'text-ink-dim hover:text-ink',
                )}
              >
                {LANGUAGE_LABELS[lang] ?? lang}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={run.isPending}
              disabled={busy}
              onClick={() => run.mutate()}
            >
              Run
            </Button>
            <Button loading={submit.isPending} disabled={busy} onClick={() => submit.mutate()}>
              Submit fix
            </Button>
          </div>
        </div>

        <CodeEditor value={code} language={language} onChange={setCode} readOnly={busy} />

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
            {message(error, 'Something went wrong.')}
          </p>
        )}

        <AnimatePresence mode="wait">
          {submissionId && (
            <SubmissionPanel
              key={submissionId}
              submissionId={submissionId}
              // Resubmits the editor's current contents, so a participant who
              // adjusted something after the failure retries what they can see.
              onRetry={() => submit.mutate()}
              retrying={submit.isPending}
            />
          )}
          {runResults && (
            <motion.div
              key="run"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel hairline divide-y divide-line/60"
            >
              {runResults.map((result, index) => (
                <div key={result.testCaseId} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px]">Reproduction {index + 1}</span>
                    <Verdict passed={result.passed} label={result.message} />
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
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function DebuggingRound({ roundId }: { roundId: string }) {
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
        <p className="mt-2 text-[14px] text-ink-dim">{message(error, 'Please try again.')}</p>
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
          <p className="mt-1 text-[14px] text-ink-faint">
            Read the report, find the cause, make the tests pass.
          </p>
        </div>

        {remainingMs !== null && remainingMs > 0 && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Time left</p>
            <p aria-hidden className="tabular font-mono text-2xl text-live">{label}</p>
          </div>
        )}
      </header>

      {isRoundClosed(round.state) ? (
        <RoundClosed competitionId={round.competitionId} state={round.state} />
      ) : (
        <>
          <RoundRules round={round} />

      {ids && ids.challengeIds.length > 1 && (
        <nav aria-label="Bugs" className="mb-5 flex flex-wrap gap-2">
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
              Bug {index + 1}
            </button>
          ))}
        </nav>
      )}

      {activeId && (
        <DebuggingWorkspace
          key={activeId}
          roundId={roundId}
          challengeId={activeId}
          languages={round.allowedLanguages.length > 0 ? round.allowedLanguages : ['PYTHON']}
        />
      )}
        </>
      )}

      <RoundExitLinks competitionId={round.competitionId} />
    </>
  );
}

export default function DebuggingRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Shell>
        <DebuggingRound roundId={id} />
      </Shell>
    </AuthGate>
  );
}
