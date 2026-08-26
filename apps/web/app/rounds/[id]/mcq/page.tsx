'use client';

import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Badge, RoundStateBadge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useCountdown, useMcqProgress, useRound } from '@/lib/hooks';
import type { Challenge } from '@/lib/types';
import { cn } from '@/lib/cn';

function Question({
  roundId,
  challenge,
  index,
  total,
  answered,
  onAnswered,
}: {
  roundId: string;
  challenge: Challenge;
  index: number;
  total: number;
  answered: boolean;
  onAnswered: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: (optionId: string) =>
      api('/submissions/mcq', {
        method: 'POST',
        body: { roundId, challengeId: challenge.id, optionId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcq-progress', roundId] });
      onAnswered();
    },
  });

  const question = challenge.mcqQuestion;
  if (!question) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="panel hairline p-6"
      aria-labelledby={`q-${challenge.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-brand-bright">
          Question {index + 1} of {total}
        </span>
        <span className="text-[13px] text-ink-faint">{challenge.points} pts</span>
      </div>

      <h2 id={`q-${challenge.id}`} className="mt-3 text-xl leading-snug">
        {question.prompt}
      </h2>

      {question.codeSnippet && (
        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface-0 p-4 font-mono text-[13px] leading-relaxed">
          <code>{question.codeSnippet}</code>
        </pre>
      )}

      <fieldset className="mt-5" disabled={answered || submit.isPending}>
        <legend className="sr-only">Choose one answer</legend>
        <div className="space-y-2">
          {question.options.map((option) => {
            const active = selected === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors duration-150',
                  active
                    ? 'border-brand bg-brand/10'
                    : 'border-line bg-surface-1 hover:border-line-bright hover:bg-surface-2',
                  (answered || submit.isPending) && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name={`q-${challenge.id}`}
                  value={option.id}
                  checked={active}
                  onChange={() => setSelected(option.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[12px]',
                    active ? 'border-brand bg-brand text-white' : 'border-line text-ink-dim',
                  )}
                >
                  {option.label}
                </span>
                <span className="text-[15px] leading-relaxed">{option.text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {submit.error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {submit.error instanceof ApiError ? submit.error.displayMessage : 'Could not submit.'}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        {answered ? (
          <Badge tone="success">Answer recorded</Badge>
        ) : (
          <Button
            disabled={!selected}
            loading={submit.isPending}
            onClick={() => selected && submit.mutate(selected)}
          >
            Submit answer
          </Button>
        )}

        {!answered && (
          <p className="text-[13px] text-ink-faint">
            You get one attempt per question.
          </p>
        )}
      </div>
    </motion.section>
  );
}

function McqRound({ roundId }: { roundId: string }) {
  const { data: round, isLoading, error } = useRound(roundId);
  const { data: progress } = useMcqProgress(roundId);
  const { label, remainingMs } = useCountdown(round?.state === 'LIVE' ? round.endsAt : null);

  const results = useSearchParams().get('view') === 'results';

  const resultsQuery = useQuery({
    queryKey: ['mcq-results', roundId],
    queryFn: () => api<McqResults>(`/submissions/mcq/rounds/${roundId}/results`),
    enabled: results,
    retry: false,
  });

  const challengeIds = useMemo(
    () => (progress ? progress.answered.map((a) => a.challengeId) : []),
    [progress],
  );

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

  if (results) {
    if (resultsQuery.isLoading) return <SkeletonRows rows={3} />;

    if (resultsQuery.error) {
      return (
        <div className="panel p-10 text-center">
          <h1 className="text-lg">Results not available yet</h1>
          <p className="mt-2 text-[14px] text-ink-dim">
            {resultsQuery.error instanceof ApiError
              ? resultsQuery.error.displayMessage
              : 'Try again later.'}
          </p>
        </div>
      );
    }

    return <McqResultsView data={resultsQuery.data!} />;
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl">{round.name}</h1>
            <RoundStateBadge state={round.state} />
          </div>
          {progress && (
            <p className="mt-1.5 text-[15px] text-ink-dim">
              {progress.answeredCount} of {progress.totalQuestions} answered
            </p>
          )}
        </div>

        {remainingMs !== null && remainingMs > 0 && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Time left</p>
            <p aria-hidden className="tabular font-mono text-2xl text-live">{label}</p>
          </div>
        )}
      </header>

      {progress && (
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-bright"
            initial={false}
            animate={{
              width: `${progress.totalQuestions ? (progress.answeredCount / progress.totalQuestions) * 100 : 0}%`,
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}

      <QuestionList roundId={roundId} answeredIds={challengeIds} />
    </>
  );
}

interface McqResults {
  round: { id: string; name: string; state: string };
  attempts: {
    isCorrect: boolean;
    rawScore: string;
    selectedOptionId: string;
    correctOptionId: string;
    challenge: { id: string; title: string; points: number };
    question: {
      prompt: string;
      explanation: string | null;
      options: { id: string; label: string; text: string }[];
    };
  }[];
  earned: number;
  available: number;
}

function McqResultsView({ data }: { data: McqResults }) {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">{data.round.name} — results</h1>
        <p className="mt-1.5 text-[15px] text-ink-dim">
          You scored <strong className="text-ink">{data.earned}</strong> of {data.available} points.
        </p>
      </header>

      <ul className="space-y-3">
        {data.attempts.map((attempt) => (
          <li key={attempt.challenge.id} className="panel hairline p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[17px] leading-snug">{attempt.question.prompt}</h2>
              <Badge tone={attempt.isCorrect ? 'success' : 'neutral'}>
                {attempt.isCorrect ? 'Correct' : 'Incorrect'}
              </Badge>
            </div>

            <ul className="mt-4 space-y-1.5">
              {attempt.question.options.map((option) => {
                const isCorrect = option.id === attempt.correctOptionId;
                const isYours = option.id === attempt.selectedOptionId;

                return (
                  <li
                    key={option.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[14px]',
                      isCorrect
                        ? 'border-success/40 bg-success/10'
                        : isYours
                          ? 'border-danger/40 bg-danger/10'
                          : 'border-line bg-surface-1',
                    )}
                  >
                    <span className="font-mono text-[12px] text-ink-dim">{option.label}</span>
                    <span className="flex-1">{option.text}</span>
                    {isCorrect && <span className="text-[12px] text-success">Correct answer</span>}
                    {isYours && !isCorrect && (
                      <span className="text-[12px] text-danger">Your answer</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {attempt.question.explanation && (
              <p className="mt-3.5 rounded-lg border border-line bg-surface-0 px-3.5 py-3 text-[14px] leading-relaxed text-ink-dim">
                {attempt.question.explanation}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function QuestionList({ roundId, answeredIds }: { roundId: string; answeredIds: string[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ['round-question-ids', roundId],
    queryFn: () => api<{ challengeIds: string[] }>(`/rounds/${roundId}/challenge-ids`),
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-[14px]" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.challengeIds.map((challengeId, index) => (
        <LoadedQuestion
          key={challengeId}
          roundId={roundId}
          challengeId={challengeId}
          index={index}
          total={data.challengeIds.length}
          answered={answeredIds.includes(challengeId)}
        />
      ))}
    </div>
  );
}

function LoadedQuestion({
  roundId,
  challengeId,
  index,
  total,
  answered,
}: {
  roundId: string;
  challengeId: string;
  index: number;
  total: number;
  answered: boolean;
}) {
  const [locallyAnswered, setLocallyAnswered] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['challenge', challengeId, roundId],
    queryFn: () => api<Challenge>(`/challenges/${challengeId}/in-round/${roundId}`),
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-[14px]" />;
  if (!data) return null;

  return (
    <Question
      roundId={roundId}
      challenge={data}
      index={index}
      total={total}
      answered={answered || locallyAnswered}
      onAnswered={() => setLocallyAnswered(true)}
    />
  );
}

export default function McqRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Shell>
        <McqRound roundId={id} />
      </Shell>
    </AuthGate>
  );
}
