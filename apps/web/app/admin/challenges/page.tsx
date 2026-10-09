'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { ConsoleShell } from '@/components/console-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { TextAreaField } from '@/components/ui/textarea';
import { SkeletonRows } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  ALL_LANGUAGES,
  CATEGORIES,
  DIFFICULTIES,
  LANGUAGE_LABELS,
  asOptions,
  label as pretty,
} from '@/lib/taxonomy';

// Taxonomy lives in lib/taxonomy.ts so this form, the importer and any filter
// share one list. The copy that used to live here went stale the moment the
// categories expanded from six to seventeen.

interface ChallengeRow {
  id: string;
  type: 'MCQ' | 'CODING' | 'DEBUGGING';
  title: string;
  category: string;
  difficulty: string;
  points: number;
  version: number;
  isPublished: boolean;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

const FORM_TITLES = {
  MCQ: 'New multiple-choice question',
  CODING: 'New coding problem',
  DEBUGGING: 'New debugging challenge',
} as const;

function McqForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[1] as string,
    difficulty: 'EASY' as string,
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
    onSuccess: () => {
      toast.success('Question created', 'Publish it to use it in a round.');
      onDone();
    },
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
              className="h-10 flex-1 rounded-lg border border-line bg-surface-1 px-3 text-[14px] text-ink focus:border-brand focus:outline-none"
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
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0] as string,
    difficulty: 'EASY' as string,
    points: 20,
    statement: '',
    constraints: '',
    starterCode: {} as Record<string, string>,
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
          ...(Object.keys(form.starterCode).length > 0
            ? { starterCode: form.starterCode }
            : {}),
          testCases: tests,
        },
      }),
    onSuccess: () => {
      toast.success('Coding problem created', 'Publish it to use it in a round.');
      onDone();
    },
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

      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-medium text-ink-dim">Starter code</legend>
        <p className="text-[13px] text-ink-faint">
          Optional, per language. A participant choosing a language with no starter code simply
          begins from an empty editor.
        </p>
        {ALL_LANGUAGES.map((lang) => (
          <TextAreaField
            key={lang}
            label={LANGUAGE_LABELS[lang]}
            mono
            className="min-h-16"
            value={form.starterCode[lang] ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                starterCode: { ...form.starterCode, [lang]: e.target.value },
              })
            }
          />
        ))}
      </fieldset>

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

/// Authoring for a debugging challenge.
///
/// Deliberately stricter than the coding form about broken code: there, an
/// empty starter snippet just means an empty editor, which is fine. Here it
/// would hand the participant nothing to fix while the bug report insists
/// something is wrong — so a language is opted into explicitly, and blank
/// entries are dropped before the request rather than sent as "".
function DebuggingForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0] as string,
    difficulty: 'MEDIUM' as string,
    points: 25,
    bugReport: '',
    failingTestOutput: '',
  });
  const [brokenCode, setBrokenCode] = useState<Record<string, string>>({ PYTHON: '' });
  const [contextFiles, setContextFiles] = useState<{ name: string; content: string }[]>([]);
  const [tests, setTests] = useState([
    { stdin: '', expectedOutput: '', isHidden: false },
    { stdin: '', expectedOutput: '', isHidden: true },
  ]);

  const languages = Object.keys(brokenCode);
  const filled = Object.entries(brokenCode).filter(([, code]) => code.trim().length > 0);
  const namedFiles = contextFiles.filter((f) => f.name.trim() && f.content.trim());

  const create = useMutation({
    mutationFn: () =>
      api('/challenges/debugging', {
        method: 'POST',
        body: {
          title: form.title,
          category: form.category,
          difficulty: form.difficulty,
          points: Number(form.points),
          bugReport: form.bugReport,
          failingTestOutput: form.failingTestOutput,
          brokenCode: Object.fromEntries(filled),
          ...(namedFiles.length > 0
            ? {
                contextFiles: Object.fromEntries(
                  namedFiles.map((f) => [f.name.trim(), f.content]),
                ),
              }
            : {}),
          testCases: tests,
        },
      }),
    onSuccess: () => {
      toast.success('Debugging challenge created', 'Publish it to use it in a round.');
      onDone();
    },
  });

  const toggleLanguage = (lang: string) =>
    setBrokenCode((current) => {
      if (!(lang in current)) return { ...current, [lang]: '' };
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== lang));
    });

  const setTest = (i: number, patch: Partial<(typeof tests)[number]>) =>
    setTests(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const setFile = (i: number, patch: Partial<(typeof contextFiles)[number]>) =>
    setContextFiles(contextFiles.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  // Mirrors the server's rule so the organizer is told before the round trip.
  const blocked =
    filled.length === 0
      ? 'Add broken code for at least one language.'
      : !tests.some((t) => t.isHidden)
        ? 'At least one hidden test case is required.'
        : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) create.mutate();
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
        label="Bug report"
        required
        hint="The symptom as a user would report it — not the cause. Naming the cause turns this back into an implementation task."
        value={form.bugReport}
        onChange={(e) => setForm({ ...form, bugReport: e.target.value })}
      />

      <TextAreaField
        label="Failing test output"
        required
        mono
        hint="Pasted verbatim from the failing run. This is the evidence the participant works from."
        value={form.failingTestOutput}
        onChange={(e) => setForm({ ...form, failingTestOutput: e.target.value })}
      />

      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-medium text-ink-dim">Broken code</legend>
        <p className="text-[13px] text-ink-faint">
          Pick the languages this bug is offered in, then paste the broken source for each. A
          participant can only choose a language you have supplied code for.
        </p>

        <div className="flex flex-wrap gap-2">
          {ALL_LANGUAGES.map((lang) => (
            <label
              key={lang}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
                lang in brokenCode
                  ? 'border-brand/60 bg-brand/10 text-ink'
                  : 'border-line text-ink-dim hover:border-line-bright',
              )}
            >
              <input
                type="checkbox"
                checked={lang in brokenCode}
                onChange={() => toggleLanguage(lang)}
                className="size-3.5 accent-[var(--color-brand)]"
              />
              {LANGUAGE_LABELS[lang]}
            </label>
          ))}
        </div>

        {languages.map((lang) => (
          <TextAreaField
            key={lang}
            label={LANGUAGE_LABELS[lang]}
            mono
            className="min-h-32"
            value={brokenCode[lang]}
            onChange={(e) => setBrokenCode({ ...brokenCode, [lang]: e.target.value })}
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-ink-dim">
          Context files <span className="font-normal text-ink-faint">(optional)</span>
        </legend>
        <p className="text-[13px] text-ink-faint">
          Read-only supporting files shown alongside the bug — a schema, a config, a helper module.
          Useful when the fault is not in the file being edited.
        </p>

        {contextFiles.map((file, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-1 p-3.5">
            <div className="mb-2.5 flex items-center gap-3">
              <input
                value={file.name}
                placeholder="filename.py"
                aria-label={`Context file ${i + 1} name`}
                onChange={(e) => setFile(i, { name: e.target.value })}
                className="h-9 flex-1 rounded-lg border border-line bg-surface-0 px-3 font-mono text-[13px] text-ink focus:border-brand focus:outline-none"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setContextFiles(contextFiles.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
            <TextAreaField
              label="Contents"
              mono
              className="min-h-24"
              value={file.content}
              onChange={(e) => setFile(i, { content: e.target.value })}
            />
          </div>
        ))}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setContextFiles([...contextFiles, { name: '', content: '' }])}
        >
          Add context file
        </Button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-ink-dim">Test cases</legend>
        <p className="text-[13px] text-ink-faint">
          Visible cases become the reproduction steps the participant can run; hidden cases decide
          the score. At least one hidden case is required.
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

      {(blocked || create.error) && (
        <p
          role="alert"
          className={cn(
            'rounded-lg border px-3.5 py-2.5 text-[14px]',
            blocked
              ? 'border-warn/40 bg-warn/10 text-warn'
              : 'border-danger/40 bg-danger/10 text-danger',
          )}
        >
          {blocked ??
            (create.error instanceof ApiError
              ? create.error.displayMessage
              : 'Could not create.')}
        </p>
      )}

      <Button type="submit" loading={create.isPending} disabled={Boolean(blocked)}>
        Create debugging challenge
      </Button>
    </form>
  );
}

function ChallengesContent() {
  const [creating, setCreating] = useState<'MCQ' | 'CODING' | 'DEBUGGING' | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-challenges'],
    queryFn: () => api<ChallengeRow[]>('/challenges'),
  });

  const publish = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      api(`/challenges/${id}/publish`, { method: 'PATCH', body: { isPublished } }),
    onSuccess: (_data, { isPublished }) => {
      toast.success(
        isPublished ? 'Published' : 'Unpublished',
        isPublished
          ? 'It can now be assigned to a round.'
          : 'It can no longer be assigned to new rounds.',
      );
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });
    },
    onError: (error) =>
      toast.error(
        'Could not change publication',
        error instanceof ApiError ? error.displayMessage : undefined,
      ),
  });

  const done = () => {
    setCreating(null);
    queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });
  };

  return (
    <>
      <PageHeader
        title="Challenge library"
        subtitle="Author questions and problems, then publish them for use in rounds."
        actions={
          <>
            <Link href="/admin/challenges/import">
              <Button variant="secondary">Import from document</Button>
            </Link>
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
            <Button
              variant={creating === 'DEBUGGING' ? 'primary' : 'secondary'}
              onClick={() => setCreating(creating === 'DEBUGGING' ? null : 'DEBUGGING')}
            >
              New bug hunt
            </Button>
          </>
        }
      />

      {creating && (
        <section className="panel hairline mb-6 p-6">
          <h2 className="mb-4 text-lg">{FORM_TITLES[creating]}</h2>
          {creating === 'MCQ' ? (
            <McqForm onDone={done} />
          ) : creating === 'CODING' ? (
            <CodingForm onDone={done} />
          ) : (
            <DebuggingForm onDone={done} />
          )}
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
      <ConsoleShell>
        <ChallengesContent />
      </ConsoleShell>
    </AuthGate>
  );
}
