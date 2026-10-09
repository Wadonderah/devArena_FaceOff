/// One source of truth for challenge taxonomy. A value in the database with no
/// label here renders as a raw enum string in front of an organizer.

export const CATEGORIES = [
  'PROGRAMMING_FUNDAMENTALS',
  'ALGORITHMS',
  'DATA_STRUCTURES',
  'BACKEND_ENGINEERING',
  'DATABASES_SQL',
  'GIT_GITHUB',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/// Enum values are SCREAMING_SNAKE; people are not.
export const label = (value: string): string =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export const asOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: label(value) }));

/// Maps free text from an imported document onto an enum value. Forgiving,
/// because papers say "Algorithms"; returns null rather than guessing, so an
/// unrecognised category falls back to the organizer's bulk selection.
export function matchCategory(input: string | null): Category | null {
  if (!input) return null;

  const normalized = input.trim().toLowerCase().replace(/[\s&-]+/g, '_');

  const exact = CATEGORIES.find((c) => c.toLowerCase() === normalized);
  if (exact) return exact;

  // "Databases" should reach DATABASES_SQL, "Backend" reach BACKEND_ENGINEERING.
  const partial = CATEGORIES.find(
    (c) => c.toLowerCase().startsWith(normalized) || normalized.startsWith(c.toLowerCase()),
  );
  return partial ?? null;
}

export function matchDifficulty(input: string | null): Difficulty | null {
  if (!input) return null;

  const normalized = input.trim().toUpperCase();
  return DIFFICULTIES.find((d) => d === normalized) ?? null;
}

/// Participant-facing language names, mirroring LANGUAGE_LABELS in
/// apps/api/src/execution/judge0.status.ts.
export const LANGUAGE_LABELS: Record<string, string> = {
  PYTHON: 'Python 3',
  JAVASCRIPT: 'JavaScript',
  TYPESCRIPT: 'TypeScript',
  JAVA: 'Java',
  CPP: 'C++',
  C: 'C',
  GO: 'Go',
  CSHARP: 'C#',
};

export const ALL_LANGUAGES = [
  'PYTHON',
  'JAVASCRIPT',
  'TYPESCRIPT',
  'JAVA',
  'CPP',
  'C',
  'GO',
  'CSHARP',
] as const;

/// Which participant page serves each round type. Central so adding a format
/// does not mean hunting down every `type === 'MCQ' ? … : …` ternary.
export const ROUND_PATH: Record<string, string> = {
  MCQ: 'mcq',
  CODING: 'coding',
  DEBUGGING: 'debugging',
};

/// What each round format is called in the interface, rather than its enum name.
export const ROUND_TYPE_NAME: Record<string, string> = {
  MCQ: 'Multiple choice',
  CODING: 'Code sprint',
  DEBUGGING: 'Bug hunt',
};
