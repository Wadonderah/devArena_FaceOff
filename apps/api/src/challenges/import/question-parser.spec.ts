import { parseQuestions } from './question-parser';

const CLEAN = `
1. What is the time complexity of binary search on a sorted array?
A. O(1)
B. O(log n)
C. O(n)
D. O(n log n)
Answer: B
Explanation: Each comparison halves the remaining search space.
Category: Algorithms
Difficulty: Easy
Points: 10

2. Which HTTP status code indicates a resource was created?
A. 200 OK
B. 201 Created
C. 204 No Content
D. 302 Found
Answer: B
`;

describe('parseQuestions — the documented format', () => {
  const { questions } = parseQuestions(CLEAN);

  it('finds every question', () => {
    expect(questions).toHaveLength(2);
  });

  it('reads the prompt without the numbering', () => {
    expect(questions[0].prompt).toBe(
      'What is the time complexity of binary search on a sorted array?',
    );
  });

  it('reads four options with their labels', () => {
    expect(questions[0].options).toEqual([
      { label: 'A', text: 'O(1)' },
      { label: 'B', text: 'O(log n)' },
      { label: 'C', text: 'O(n)' },
      { label: 'D', text: 'O(n log n)' },
    ]);
  });

  it('resolves the answer key to an option index and marks its origin', () => {
    expect(questions[0].correctIndex).toBe(1);
    expect(questions[0].answerFromDocument).toBe(true);
  });

  it('reads the optional metadata', () => {
    expect(questions[0]).toMatchObject({
      explanation: 'Each comparison halves the remaining search space.',
      category: 'Algorithms',
      difficulty: 'Easy',
      points: 10,
    });
  });

  it('leaves metadata null when the document omits it', () => {
    expect(questions[1].explanation).toBeNull();
    expect(questions[1].points).toBeNull();
  });

  it('raises no warnings on a well-formed question', () => {
    expect(questions[0].warnings).toEqual([]);
  });
});

describe('parseQuestions — accepted variations', () => {
  it('accepts Q1) and (A) style labelling', () => {
    const { questions } = parseQuestions(`
Q1) Which keyword declares a constant in JavaScript?
(A) var
(B) let
(C) const
(D) static
Ans: C
`);
    expect(questions[0].prompt).toContain('Which keyword');
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].correctIndex).toBe(2);
  });

  it('accepts "Question 1:" and "Correct:"', () => {
    const { questions } = parseQuestions(`
Question 1: What does SQL stand for?
A. Structured Query Language
B. Simple Query Logic
C. Sequential Query Language
D. Standard Question Layout
Correct: A
`);
    expect(questions[0].correctIndex).toBe(0);
  });

  it('reads options that run together on one line', () => {
    const { questions } = parseQuestions(`
1. Which is a prime number?
A. 4  B. 6  C. 7  D. 9
Answer: C
`);
    expect(questions[0].options.map((o) => o.text)).toEqual(['4', '6', '7', '9']);
    expect(questions[0].correctIndex).toBe(2);
  });

  it('joins a prompt that wraps across lines', () => {
    const { questions } = parseQuestions(`
1. Which data structure follows
   last-in, first-out ordering?
A. Queue
B. Stack
C. Heap
D. Graph
`);
    expect(questions[0].prompt).toBe(
      'Which data structure follows last-in, first-out ordering?',
    );
  });

  it('joins an option that wraps across lines', () => {
    const { questions } = parseQuestions(`
1. What does an index improve?
A. The speed of reads at
   the cost of slower writes
B. Nothing at all
C. Only disk usage
D. Only write speed
`);
    expect(questions[0].options[0].text).toBe(
      'The speed of reads at the cost of slower writes',
    );
  });

  it('survives curly quotes and en dashes from a word processor', () => {
    const { questions } = parseQuestions(`
1. What does the “this” keyword refer to — in a method call?
A. The global object
B. The receiver
C. Nothing
D. The prototype
`);
    expect(questions[0].prompt).toContain('"this"');
    expect(questions[0].options).toHaveLength(4);
  });
});

describe('parseQuestions — flagging what needs a human', () => {
  it('flags a question with the wrong number of options', () => {
    const { questions } = parseQuestions(`
1. Which of these is a database?
A. Postgres
B. Redis
C. MySQL
`);
    expect(questions[0].warnings).toContain('WRONG_OPTION_COUNT');
  });

  it('flags a missing answer key rather than guessing one', () => {
    const { questions } = parseQuestions(`
1. Which protocol underpins the web?
A. FTP
B. HTTP
C. SMTP
D. SSH
`);
    expect(questions[0].correctIndex).toBeNull();
    expect(questions[0].warnings).toContain('NO_ANSWER_KEY');
  });

  it('discards an answer key pointing past the options it found', () => {
    // A key of D with only three options means something was lost in
    // extraction; keeping it would silently mis-key the question.
    const { questions } = parseQuestions(`
1. Which of these is a version control system?
A. Git
B. Docker
C. Nginx
Answer: D
`);
    expect(questions[0].correctIndex).toBeNull();
    expect(questions[0].warnings).toContain('ANSWER_OUT_OF_RANGE');
  });

  it('flags a suspiciously short prompt', () => {
    const { questions } = parseQuestions(`
1. Why?
A. One
B. Two
C. Three
D. Four
`);
    expect(questions[0].warnings).toContain('SHORT_PROMPT');
  });

  it('flags a duplicated question, keeping both for review', () => {
    const { questions } = parseQuestions(`
1. What is the capital of Ghana?
A. Accra
B. Kumasi
C. Tamale
D. Takoradi

2. What is the capital of Ghana?
A. Accra
B. Kumasi
C. Tamale
D. Takoradi
`);
    expect(questions).toHaveLength(2);
    expect(questions[0].warnings).not.toContain('DUPLICATE_PROMPT');
    expect(questions[1].warnings).toContain('DUPLICATE_PROMPT');
  });
});

describe('parseQuestions — malformed input', () => {
  it('returns nothing for text with no questions, without throwing', () => {
    const { questions, skippedLineCount } = parseQuestions(
      'This is just a paragraph of prose with no questions in it at all.',
    );
    expect(questions).toEqual([]);
    expect(skippedLineCount).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    expect(parseQuestions('').questions).toEqual([]);
  });

  it('reports unattributed text, which is what a lost numbering looks like', () => {
    // Word's automatic list numbering is not extracted, so the questions arrive
    // unnumbered. Nothing anchors a question, and every line is skipped — this
    // count is what lets the UI explain why an import found nothing.
    const { questions, skippedLineCount } = parseQuestions(`
What is the time complexity of binary search?
A. O(1)
B. O(log n)
C. O(n)
D. O(n log n)
`);
    expect(questions).toEqual([]);
    expect(skippedLineCount).toBeGreaterThan(0);
  });

  it('strips page numbers that fall between questions', () => {
    const { questions } = parseQuestions(`
1. Which is a compiled language?
A. Python
B. Go
C. Ruby
D. PHP
Page 2 of 5
2. Which is interpreted?
A. C
B. Rust
C. Python
D. Go
`);
    expect(questions).toHaveLength(2);
    expect(questions[0].options).toHaveLength(4);
  });

  it('does not mistake a year in a prompt for a new question', () => {
    const { questions } = parseQuestions(`
1. Which standard was published in
2015. and introduced let and const?
A. ES5
B. ES2015
C. ES2017
D. ES2020
`);
    expect(questions).toHaveLength(1);
  });
});
