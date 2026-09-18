/// Turns the text of a question paper into reviewable drafts.
///
/// Deliberately a pure function — text in, drafts out. That keeps it testable
/// against fixture strings with no file upload, and means an AI-backed parser
/// could replace it later behind the same signature without touching the upload
/// endpoint or the review UI.
///
/// It never decides anything final. Every draft goes to an organizer for review,
/// which is why the parser prefers to emit a flagged draft over silently dropping
/// something it half-understood.

export type DraftWarning =
  | 'WRONG_OPTION_COUNT'
  | 'NO_ANSWER_KEY'
  | 'SHORT_PROMPT'
  | 'DUPLICATE_PROMPT'
  | 'ANSWER_OUT_OF_RANGE';

export interface DraftOption {
  label: string;
  text: string;
}

export interface DraftQuestion {
  /// Position in the document, so review can show them in the author's order.
  index: number;
  prompt: string;
  options: DraftOption[];
  /// Index into `options`, or null when the document did not supply a key.
  correctIndex: number | null;
  /// True when the answer came from the document rather than the organizer, so
  /// review can label it and invite a second look.
  answerFromDocument: boolean;
  explanation: string | null;
  category: string | null;
  difficulty: string | null;
  points: number | null;
  warnings: DraftWarning[];
}

export interface ParseResult {
  questions: DraftQuestion[];
  /// Lines the parser could not attribute to any question. Surfaced so a failed
  /// import can be diagnosed — usually it means the numbering was lost.
  skippedLineCount: number;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

// `1.` `1)` `Q1.` `Question 1:` — the numeral is what actually anchors a question,
// which is why the format doc insists it be typed rather than auto-numbered.
const QUESTION_START = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)\]:-]\s*(.*)$/i;

// `A.` `A)` `(A)` `a.` — captures the label and whatever follows it.
const OPTION_START = /^\s*\(?([A-Da-d])\)?\s*[.)\]:-]\s+(.*)$/;

// Options run together on one line: "A. foo  B. bar  C. baz  D. qux"
const INLINE_OPTIONS = /\(?([A-Da-d])\)?\s*[.)\]:-]\s+/g;

const META = {
  answer: /^\s*(?:answer|ans|correct(?:\s*answer)?)\s*[:.-]\s*\(?([A-Da-d])\)?\s*$/i,
  explanation: /^\s*(?:explanation|rationale|why)\s*[:.-]\s*(.+)$/i,
  category: /^\s*(?:category|topic|subject)\s*[:.-]\s*(.+)$/i,
  difficulty: /^\s*(?:difficulty|level)\s*[:.-]\s*(.+)$/i,
  points: /^\s*(?:points?|marks?|score)\s*[:.-]\s*(\d{1,4})\s*$/i,
};

const MIN_PROMPT_LENGTH = 12;

export function parseQuestions(raw: string): ParseResult {
  const lines = normalize(raw);

  const questions: DraftQuestion[] = [];
  let current: Partial<DraftQuestion> & { options: DraftOption[] } = { options: [] };
  let started = false;
  let skippedLineCount = 0;

  const commit = () => {
    if (!started) return;
    questions.push(finalize(current, questions.length));
    current = { options: [] };
    started = false;
  };

  for (const line of lines) {
    const question = QUESTION_START.exec(line);

    // A numeral only starts a new question if it is not really an option line —
    // otherwise a stem like "2010. Which year…" would swallow the next question.
    if (question && !OPTION_START.test(line)) {
      commit();
      started = true;
      current = { prompt: question[2].trim(), options: [] };
      continue;
    }

    if (!started) {
      if (line.trim()) skippedLineCount += 1;
      continue;
    }

    const meta = readMeta(line);
    if (meta) {
      Object.assign(current, meta);
      continue;
    }

    const inline = readInlineOptions(line);
    if (inline.length > 1) {
      current.options.push(...inline);
      continue;
    }

    const option = OPTION_START.exec(line);
    if (option) {
      current.options.push({ label: option[1].toUpperCase(), text: option[2].trim() });
      continue;
    }

    // Anything else continues whatever we are in the middle of: a wrapped stem
    // before any option, or a wrapped option after one.
    if (current.options.length === 0) {
      current.prompt = `${current.prompt ?? ''} ${line.trim()}`.trim();
    } else {
      const last = current.options[current.options.length - 1];
      last.text = `${last.text} ${line.trim()}`.trim();
    }
  }

  commit();

  return { questions: flagDuplicates(questions), skippedLineCount };
}

function normalize(raw: string): string[] {
  return (
    raw
      // Normalise line endings and the punctuation word processors substitute,
      // so a curly quote or an en dash does not defeat a pattern.
      .replace(/\r\n?/g, '\n')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      // Page numbers and running headers are noise between questions.
      .filter((line) => !/^\s*(?:page\s+)?\d{1,3}\s*(?:of\s+\d{1,3})?\s*$/i.test(line))
  );
}

function readMeta(line: string): Partial<DraftQuestion> | null {
  const answer = META.answer.exec(line);
  if (answer) {
    const index = LABELS.indexOf(answer[1].toUpperCase() as (typeof LABELS)[number]);
    return { correctIndex: index >= 0 ? index : null, answerFromDocument: true };
  }

  const explanation = META.explanation.exec(line);
  if (explanation) return { explanation: explanation[1].trim() };

  const category = META.category.exec(line);
  if (category) return { category: category[1].trim() };

  const difficulty = META.difficulty.exec(line);
  if (difficulty) return { difficulty: difficulty[1].trim() };

  const points = META.points.exec(line);
  if (points) return { points: Number(points[1]) };

  return null;
}

/// Splits "A. foo  B. bar  C. baz  D. qux" into separate options.
function readInlineOptions(line: string): DraftOption[] {
  const matches = [...line.matchAll(INLINE_OPTIONS)];
  if (matches.length < 2) return [];

  return matches.map((match, i) => {
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : line.length;
    return { label: match[1].toUpperCase(), text: line.slice(start, end).trim() };
  });
}

function finalize(
  draft: Partial<DraftQuestion> & { options: DraftOption[] },
  index: number,
): DraftQuestion {
  const prompt = (draft.prompt ?? '').trim();
  const options = draft.options.map((o) => ({ ...o, text: o.text.trim() }));
  const warnings: DraftWarning[] = [];

  if (options.length !== 4) warnings.push('WRONG_OPTION_COUNT');
  if (prompt.length < MIN_PROMPT_LENGTH) warnings.push('SHORT_PROMPT');

  let correctIndex = draft.correctIndex ?? null;

  // A key pointing past the options we actually found is worse than no key.
  if (correctIndex !== null && correctIndex >= options.length) {
    warnings.push('ANSWER_OUT_OF_RANGE');
    correctIndex = null;
  }

  if (correctIndex === null) warnings.push('NO_ANSWER_KEY');

  return {
    index,
    prompt,
    options,
    correctIndex,
    answerFromDocument: Boolean(draft.answerFromDocument) && correctIndex !== null,
    explanation: draft.explanation ?? null,
    category: draft.category ?? null,
    difficulty: draft.difficulty ?? null,
    points: draft.points ?? null,
    warnings,
  };
}

/// A paper that repeats a question is nearly always a copy-paste slip during
/// authoring, and it is far easier to catch here than after import.
function flagDuplicates(questions: DraftQuestion[]): DraftQuestion[] {
  const seen = new Map<string, number>();

  return questions.map((question) => {
    const key = question.prompt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) return question;

    if (seen.has(key)) {
      return { ...question, warnings: [...question.warnings, 'DUPLICATE_PROMPT' as const] };
    }

    seen.set(key, question.index);
    return question;
  });
}
