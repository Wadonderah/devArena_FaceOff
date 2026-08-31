'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { TextAreaField } from '@/components/ui/textarea';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const CATEGORIES = [
  'PROGRAMMING_FUNDAMENTALS',
  'ALGORITHMS',
  'DATA_STRUCTURES',
  'BACKEND_ENGINEERING',
  'DATABASES_SQL',
  'GIT_GITHUB',
];

const DIFFICULTIES = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD'];

const pretty = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const asOptions = (values: string[]) => values.map((v) => ({ value: v, label: pretty(v) }));

interface ChallengeRow {
  id: string;
  type: 'MCQ' | 'CODING';
  title: string;
  category: string;
  difficulty: string;
  points: number;
  version: number;
  isPublished: boolean;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

function McqForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[1],
    difficulty: 'EASY',
    points: 10,
    prompt: '',
    codeSnippet: '',
    explanation: '',
  });
  const [texts, setTexts] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);

  const create = useMutation({
    mutationFn: () =>
      api('/challenges/mcq', {
        method: 'POST',
        body: {
          title: form.title,
          category: form.category,
          difficulty: form.difficulty,
          points: Number(form.points),
          prompt: form.prompt,
          ...(form.codeSnippet ? { codeSnippet: form.codeSnippet } : {}),
          ...(form.explanation ? { explanation: form.explanation } : {}),
          options: texts.map((text, i) => ({
            label: LABELS[i],
            text,
            isCorrect: i === correct,
          })),
        },
      }),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Field
        label="Title"
        required
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Category"
          options={asOptions(CATEGORIES)}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <SelectField
          label="Difficulty"
          options={asOptions(DIFFICULTIES)}
          value={form.difficulty}
          onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
        />
        <Field
          label="Points"
          type="number"
          min={1}
          max={1000}
          value={form.points}
          onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
        />
      </div>

      <TextAreaField
        label="Question"
        required
        value={form.prompt}
        onChange={(e) => setForm({ ...form, prompt: e.target.value })}
      />

      <TextAreaField
        label="Code snippet (optional)"
        mono
        value={form.codeSnippet}
        onChange={(e) => setForm({ ...form, codeSnippet: e.target.value })}
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-medium text-ink-dim">
          Options — select the correct one
        </legend>
        {texts.map((text, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <label className="sr-only" htmlFor={`opt-${i}`}>
              Option {LABELS[i]}
            </label>
            <input
              type="radio"
              name="correct"
              checked={correct === i}
              onChange={() => setCorrect(i)}
              aria-label={`Mark option ${LABELS[i]} correct`}
              className="size-4 accent-[var(--color-brand)]"
            />
            <span
              aria-hidden
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-lg border font-mono text-[12px]',
                correct === i ? 'border-success/60 bg-success/10 text-success' : 'border-line text-ink-dim',
              )}
            >
              {LABELS[i]}
            </span>
            <input
              id={`opt-${i}`}
              required
              value={text}
              onChange={(e) => setTexts(texts.map((t, j) => (j === i ? e.target.value : t)))}
              className="h-10 flex-1 rounded-[10px] border border-line bg-surface-1 px-3 text-[14px] text-ink focus:border-brand focus:outline-none"
            />
          </div>
        ))}
      </fieldset>

      <TextAreaField
        label="Explanation"
        hint="Shown after submission in IMMEDIATE rounds, or once the round closes."
        value={form.explanation}
        onChange={(e) => setForm({ ...form, explanation: e.target.value })}
      />

      {create.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {create.error instanceof ApiError ? create.error.displayMessage : 'Could not create.'}
        </p>
      )}

      <Button type="submit" loading={create.isPending}>
        Create question
      </Button>
    </form>
  );
}

function CodingForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    difficulty: 'EASY',
    points: 20,
    statement: '',
    constraints: '',
    starterCodePy: '',
    starterCodeJs: '',
  });
  const [tests, setTests] = useState([
    { stdin: '', expectedOutput: '', isHidden: false },
    { stdin: '', expectedOutput: '', isHidden: true },
  ]);

  const create = useMutation({
    mutationFn: () =>
      api('/challenges/coding', {
        method: 'POST',
        body: {
          title: form.title,
          category: form.category,
          difficulty: form.difficulty,
          points: Number(form.points),
          statement: form.statement,
          ...(form.constraints ? { constraints: form.constraints } : {}),
          ...(form.starterCodePy ? { starterCodePy: form.starterCodePy } : {}),
          ...(form.starterCodeJs ? { starterCodeJs: form.starterCodeJs } : {}),
          testCases: tests,
        },
      }),
    onSuccess: onDone,
  });

  const setTest = (i: number, patch: Partial<(typeof tests)[number]>) =>
    setTests(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Field
        label="Title"
        required
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Category"
          options={asOptions(CATEGORIES)}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <SelectField
          label="Difficulty"
          options={asOptions(DIFFICULTIES)}
          value={form.difficulty}
          onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
        />
        <Field
          label="Points"
          type="number"
          min={1}
          max={1000}
          value={form.points}
          onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
        />
      </div>

      <TextAreaField
        label="Problem statement"
        required
        value={form.statement}
        onChange={(e) => setForm({ ...form, statement: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextAreaField
          label="Python starter code"
          mono
          value={form.starterCodePy}
          onChange={(e) => setForm({ ...form, starterCodePy: e.target.value })}
        />
        <TextAreaField
          label="JavaScript starter code"
          mono
          value={form.starterCodeJs}
          onChange={(e) => setForm({ ...form, starterCodeJs: e.target.value })}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-ink-dim">Test cases</legend>
        <p className="text-[13px] text-ink-faint">
          At least one visible (so participants can run their code) and one hidden (so the
          solution cannot be hard-coded) are required.
        </p>

        {tests.map((test, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-1 p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-dim">Test {i + 1}</span>
              <label className="flex items-center gap-2 text-[13px] text-ink-dim">
                <input
                  type="checkbox"
                  checked={test.isHidden}
                  onChange={(e) => setTest(i, { isHidden: e.target.checked })}
                  className="size-4 accent-[var(--color-brand)]"
                />
                Hidden
              </label>
              {tests.length > 2 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setTests(tests.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <TextAreaField
                label="stdin"
                mono
                className="min-h-16"
                value={test.stdin}
                onChange={(e) => setTest(i, { stdin: e.target.value })}
              />
              <TextAreaField
                label="Expected output"
                mono
                className="min-h-16"
                value={test.expectedOutput}
                onChange={(e) => setTest(i, { expectedOutput: e.target.value })}
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setTests([...tests, { stdin: '', expectedOutput: '', isHidden: true }])}
        >
          Add test case
        </Button>
      </fieldset>

      {create.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {create.error instanceof ApiError ? create.error.displayMessage : 'Could not create.'}
        </p>
      )}

      <Button type="submit" loading={create.isPending}>
        Create problem
      </Button>
    </form>
  );
}

function ChallengesContent() {
  const [creating, setCreating] = useState<'MCQ' | 'CODING' | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-challenges'],
    queryFn: () => api<ChallengeRow[]>('/challenges'),
  });

  const publish = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      api(`/challenges/${id}/publish`, { method: 'PATCH', body: { isPublished } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-challenges'] }),
  });

  const done = () => {
    setCreating(null);
    queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Challenge library</h1>
          <p className="mt-1.5 text-[15px] text-ink-dim">
            Author questions and problems, then publish them for use in rounds.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={creating === 'MCQ' ? 'primary' : 'secondary'}
            onClick={() => setCreating(creating === 'MCQ' ? null : 'MCQ')}
          >
            New question
          </Button>
          <Button
            variant={creating === 'CODING' ? 'primary' : 'secondary'}
            onClick={() => setCreating(creating === 'CODING' ? null : 'CODING')}
          >
            New problem
          </Button>
        </div>
      </header>

      {creating && (
        <section className="panel hairline mb-6 p-6">
          <h2 className="mb-4 text-lg">
            {creating === 'MCQ' ? 'New multiple-choice question' : 'New coding problem'}
          </h2>
          {creating === 'MCQ' ? <McqForm onDone={done} /> : <CodingForm onDone={done} />}
        </section>
      )}

      {publish.error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {publish.error instanceof ApiError ? publish.error.displayMessage : 'Could not update.'}
        </p>
      )}

      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="panel hairline overflow-hidden">
          <ul className="divide-y divide-line/60">
            {data?.map((challenge) => (
              <li key={challenge.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{challenge.title}</p>
                  <p className="text-[13px] text-ink-faint">
                    {challenge.type} · {pretty(challenge.category)} ·{' '}
                    {pretty(challenge.difficulty)} · {challenge.points} pts · v{challenge.version}
                  </p>
                </div>
                <Badge tone={challenge.isPublished ? 'success' : 'neutral'}>
                  {challenge.isPublished ? 'Published' : 'Draft'}
                </Badge>
                <Button
                  size="sm"
                  variant={challenge.isPublished ? 'ghost' : 'primary'}
                  loading={publish.isPending}
                  onClick={() =>
                    publish.mutate({ id: challenge.id, isPublished: !challenge.isPublished })
                  }
                >
                  {challenge.isPublished ? 'Unpublish' : 'Publish'}
                </Button>
              </li>
            ))}
          </ul>
          {data?.length === 0 && (
            <p className="p-8 text-center text-[14px] text-ink-dim">
              No challenges yet. Create one above.
            </p>
          )}
        </div>
      )}
    </>
  );
}

export default function AdminChallengesPage() {
  return (
    <AuthGate requireStaff>
      <Shell>
        <ChallengesContent />
      </Shell>
    </AuthGate>
  );
}
