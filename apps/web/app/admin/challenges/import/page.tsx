'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { ConsoleShell } from '@/components/console-shell';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { TextAreaField } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiUrl } from '@/lib/api';
import { api } from '@/lib/api';
import {
  CATEGORIES,
  DIFFICULTIES,
  asOptions,
  matchCategory,
  matchDifficulty,
} from '@/lib/taxonomy';
import { cn } from '@/lib/cn';

type Warning =
  | 'WRONG_OPTION_COUNT'
  | 'NO_ANSWER_KEY'
  | 'SHORT_PROMPT'
  | 'DUPLICATE_PROMPT'
  | 'ANSWER_OUT_OF_RANGE';

const WARNING_TEXT: Record<Warning, string> = {
  WRONG_OPTION_COUNT: 'Needs exactly four options',
  NO_ANSWER_KEY: 'No answer in the document — pick one',
  SHORT_PROMPT: 'Very short question — check it parsed fully',
  DUPLICATE_PROMPT: 'Same question appears earlier in the file',
  ANSWER_OUT_OF_RANGE: 'Answer key pointed at a missing option',
};

interface DraftOption {
  label: string;
  text: string;
}

interface Draft {
  index: number;
  prompt: string;
  options: DraftOption[];
  correctIndex: number | null;
  answerFromDocument: boolean;
  explanation: string | null;
  category: string | null;
  difficulty: string | null;
  points: number | null;
  warnings: Warning[];
}

interface Preview {
  kind: 'pdf' | 'docx';
  questions: Draft[];
  summary: {
    found: number;
    withAnswerKey: number;
    needingAttention: number;
    skippedLines: number;
  };
}

const LABELS = ['A', 'B', 'C', 'D'];

function DraftCard({
  draft,
  onChange,
  onDiscard,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onDiscard: () => void;
}) {
  const incomplete = draft.correctIndex === null || draft.options.length !== 4;

  return (
    <li
      className={cn(
        'rounded-xl border bg-surface-1 p-4 sm:p-5',
        incomplete ? 'border-warn/45' : 'border-line',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-faint">
          Question {draft.index + 1}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {draft.answerFromDocument && draft.correctIndex !== null && (
            <Badge tone="brand">Answer from document</Badge>
          )}
          {draft.warnings.map((w) => (
            <Badge key={w} tone="warn">
              {WARNING_TEXT[w]}
            </Badge>
          ))}
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </div>

      <TextAreaField
        label="Question"
        className="min-h-16"
        value={draft.prompt}
        onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
      />

      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 text-[13px] font-medium text-ink-dim">
          Options — select the correct one
        </legend>

        {LABELS.map((letter, i) => {
          const option = draft.options[i];
          const checked = draft.correctIndex === i;

          return (
            <div key={letter} className="flex items-center gap-2.5">
              <input
                type="radio"
                name={`correct-${draft.index}`}
                checked={checked}
                onChange={() =>
                  onChange({ ...draft, correctIndex: i, answerFromDocument: false })
                }
                aria-label={`Mark option ${letter} correct`}
                className="size-4 accent-[var(--color-brand)]"
              />
              <span
                aria-hidden
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg border font-mono text-[12px]',
                  checked
                    ? 'border-success/60 bg-success/10 text-success'
                    : 'border-line text-ink-dim',
                )}
              >
                {letter}
              </span>
              <input
                value={option?.text ?? ''}
                placeholder={option ? '' : 'Missing — type this option'}
                onChange={(e) => {
                  const options = [...draft.options];
                  options[i] = { label: letter, text: e.target.value };
                  onChange({ ...draft, options });
                }}
                className="h-10 flex-1 rounded-lg border border-line bg-surface-0 px-3 text-[14px] text-ink focus:border-brand focus:outline-none"
              />
            </div>
          );
        })}
      </fieldset>

      <TextAreaField
        label="Explanation"
        className="mt-4 min-h-14"
        value={draft.explanation ?? ''}
        onChange={(e) => onChange({ ...draft, explanation: e.target.value })}
      />
    </li>
  );
}

function ImportContent() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [bulk, setBulk] = useState({ category: CATEGORIES[1], difficulty: 'EASY', points: 10 });
  const [created, setCreated] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);

      // FormData, so no Content-Type header — the browser must set the multipart
      // boundary itself. This is why it bypasses the shared api() helper.
      const res = await fetch(apiUrl('/challenges/import/document'), {
        method: 'POST',
        credentials: 'include',
        body,
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(
          res.status,
          payload?.code ?? 'ERROR',
          payload?.message ?? 'Could not read that file',
          payload?.details,
        );
      }
      return payload as Preview;
    },
    onSuccess: (data) => {
      setPreview(data);
      setDrafts(data.questions);
      setCreated(null);

      if (data.questions.length === 0) {
        toast.error(
          'No questions found',
          data.summary.skippedLines > 0
            ? 'Text was read but nothing looked like a numbered question. Automatic list numbering is the usual cause.'
            : 'That document appears to be empty.',
        );
      } else {
        toast.success(
          `Found ${data.questions.length} questions`,
          `${data.summary.withAnswerKey} came with an answer key.`,
        );
      }
    },
    onError: (err) =>
      toast.error(
        'Could not read that file',
        err instanceof ApiError ? err.displayMessage : 'Please try again.',
      ),
  });

  const create = useMutation({
    mutationFn: async () => {
      const ready = drafts.filter((d) => d.correctIndex !== null && d.options.length === 4);
      let ok = 0;
      const failures: string[] = [];

      // Sequential on purpose: a partial failure should be reportable, and the
      // rate limiter would reject a burst of forty parallel creates.
      for (const draft of ready) {
        try {
          await api('/challenges/mcq', {
            method: 'POST',
            body: {
              title: draft.prompt.slice(0, 120),
              category: matchCategory(draft.category) ?? bulk.category,
              difficulty: matchDifficulty(draft.difficulty) ?? bulk.difficulty,
              points: draft.points ?? Number(bulk.points),
              prompt: draft.prompt,
              ...(draft.explanation ? { explanation: draft.explanation } : {}),
              options: draft.options.map((o, i) => ({
                label: LABELS[i],
                text: o.text,
                isCorrect: i === draft.correctIndex,
              })),
            },
          });
          ok += 1;
        } catch (err) {
          failures.push(
            `Q${draft.index + 1}: ${err instanceof ApiError ? err.displayMessage : 'failed'}`,
          );
        }
      }

      return { ok, failures };
    },
    onSuccess: ({ ok, failures }) => {
      setCreated(ok);
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] });

      if (failures.length === 0) {
        toast.success(`Created ${ok} questions`, 'They are in the library as drafts — publish when ready.');
        setDrafts([]);
        setPreview(null);
      } else {
        toast.error(
          `Created ${ok}, ${failures.length} failed`,
          failures.slice(0, 2).join(' · '),
        );
      }
    },
  });

  const ready = drafts.filter((d) => d.correctIndex !== null && d.options.length === 4).length;

  return (
    <>
      <PageHeader
        title="Import questions"
        subtitle="Upload a PDF or Word file, check what was read, then add it to the library."
        actions={
          <Link href="/admin/challenges">
            <Button variant="secondary">Back to library</Button>
          </Link>
        }
      />

      {!preview && (
        <section className="panel hairline bracketed p-5 sm:p-8 text-center">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />

          <p className="font-display text-xl">Choose a question paper</p>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-dim">
            PDF or .docx, up to 10 MB. Nothing is added to the library until you review it and
            press Create.
          </p>

          <Button
            className="mt-6"
            loading={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            Select file
          </Button>

          <p className="mt-6 border-t border-line pt-4 sm:pt-5 text-[13px] text-ink-faint">
            Questions must be numbered as typed text, one column, four options each.{' '}
            <span className="text-ink-dim">
              Word&apos;s automatic list numbering does not survive extraction — type the numbers
              yourself.
            </span>
          </p>
        </section>
      )}

      {preview && (
        <>
          <section className="panel hairline mb-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {[
                  ['Found', preview.summary.found],
                  ['With answer key', preview.summary.withAnswerKey],
                  ['Need attention', preview.summary.needingAttention],
                  ['Ready to create', ready],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                      {label}
                    </p>
                    <p className="tabular mt-0.5 font-display text-xl">{value}</p>
                  </div>
                ))}
              </div>

              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  setDrafts([]);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              >
                Start over
              </Button>
            </div>

            {preview.questions.length === 0 && (
              <p role="alert" className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-3 text-[14px] text-warn">
                Nothing looked like a numbered question. The most common cause is Word&apos;s
                automatic list numbering, which is formatting rather than text and disappears when
                the file is read. Type the numbers manually and upload again.
              </p>
            )}
          </section>

          {drafts.length > 0 && (
            <>
              <section className="panel hairline mb-5 p-4 sm:p-5">
                <h2 className="text-[12px] uppercase tracking-[0.12em] text-ink-faint">
                  Apply to all
                </h2>
                <p className="mt-1 text-[13px] text-ink-faint">
                  Used where the document did not specify. Most papers share these.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <SelectField
                    label="Category"
                    options={asOptions(CATEGORIES)}
                    value={bulk.category}
                    onChange={(e) => setBulk({ ...bulk, category: e.target.value as typeof bulk.category })}
                  />
                  <SelectField
                    label="Difficulty"
                    options={asOptions(DIFFICULTIES)}
                    value={bulk.difficulty}
                    onChange={(e) => setBulk({ ...bulk, difficulty: e.target.value })}
                  />
                  <Field
                    label="Points"
                    type="number"
                    min={1}
                    max={1000}
                    value={bulk.points}
                    onChange={(e) => setBulk({ ...bulk, points: Number(e.target.value) })}
                  />
                </div>
              </section>

              <ul className="space-y-4">
                {drafts.map((draft, i) => (
                  <DraftCard
                    key={draft.index}
                    draft={draft}
                    onChange={(next) =>
                      setDrafts(drafts.map((d, j) => (j === i ? next : d)))
                    }
                    onDiscard={() => setDrafts(drafts.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>

              <div className="sticky bottom-4 mt-6">
                <div className="panel hairline flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-[14px] text-ink-dim">
                    {ready} of {drafts.length} ready.{' '}
                    {drafts.length - ready > 0 && (
                      <span className="text-warn">
                        {drafts.length - ready} still need an answer or a fourth option.
                      </span>
                    )}
                  </p>
                  <Button
                    disabled={ready === 0}
                    loading={create.isPending}
                    onClick={() => create.mutate()}
                  >
                    Create {ready} question{ready === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {created !== null && drafts.length === 0 && (
        <section className="panel hairline p-5 sm:p-8 text-center">
          <p className="font-display text-xl">{created} questions added</p>
          <p className="mt-2 text-[14px] text-ink-dim">
            They are in the library as drafts. Publish them before adding them to a round.
          </p>
          <Link href="/admin/challenges" className="mt-5 inline-block">
            <Button>Open the library</Button>
          </Link>
        </section>
      )}
    </>
  );
}

export default function ImportPage() {
  return (
    <AuthGate requireStaff>
      <ConsoleShell>
        <ImportContent />
      </ConsoleShell>
    </AuthGate>
  );
}
