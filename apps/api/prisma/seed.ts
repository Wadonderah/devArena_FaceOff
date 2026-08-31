import {
  Category,
  ChallengeType,
  CompetitionState,
  Difficulty,
  Language,
  PrismaClient,
  Role,
  RoundType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Development fixture only. The password is intentionally well-known so the
// dataset is reproducible; the guard below keeps it out of production.
const DEV_PASSWORD = 'Competition2026';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const people: { email: string; displayName: string; role: Role }[] = [
    { email: 'admin@akwannya-hub.org', displayName: 'Platform Admin', role: Role.SUPER_ADMIN },
    { email: 'organizer@akwannya-hub.org', displayName: 'Competition Organizer', role: Role.ORGANIZER },
    { email: 'ama@example.com', displayName: 'Ama Boateng', role: Role.PARTICIPANT },
    { email: 'kwame@example.com', displayName: 'Kwame Mensah', role: Role.PARTICIPANT },
    { email: 'efua@example.com', displayName: 'Efua Owusu', role: Role.PARTICIPANT },
  ];

  const users = [];
  for (const person of people) {
    users.push(
      await prisma.user.upsert({
        where: { email: person.email },
        update: {},
        create: {
          email: person.email,
          passwordHash,
          role: person.role,
          emailVerified: true,
          profile: { create: { displayName: person.displayName, country: 'Ghana' } },
        },
        select: { id: true, email: true, role: true },
      }),
    );
  }

  const competition = await prisma.competition.upsert({
    where: { slug: 'faceoff-season-1' },
    update: {},
    create: {
      slug: 'faceoff-season-1',
      name: 'Software Engineering Face-Off — Season 1',
      description: 'Two rounds: Knowledge Arena, then Code Sprint.',
      state: CompetitionState.REGISTRATION,
    },
  });

  const mcqSeeds = [
    {
      title: 'Binary search complexity',
      category: Category.ALGORITHMS,
      prompt: 'What is the time complexity of binary search on a sorted array?',
      explanation: 'Each comparison halves the remaining search space.',
      options: [
        ['A', 'O(1)', false],
        ['B', 'O(log n)', true],
        ['C', 'O(n)', false],
        ['D', 'O(n log n)', false],
      ] as const,
    },
    {
      title: 'Stack ordering',
      category: Category.DATA_STRUCTURES,
      prompt: 'Which ordering does a stack follow?',
      explanation: 'A stack is last-in, first-out.',
      options: [
        ['A', 'FIFO', false],
        ['B', 'LIFO', true],
        ['C', 'Random access', false],
        ['D', 'Priority order', false],
      ] as const,
    },
    {
      title: 'SQL join semantics',
      category: Category.DATABASES_SQL,
      prompt: 'Which join returns every row from the left table regardless of a match?',
      explanation: 'A LEFT JOIN keeps unmatched left rows, filling the right side with NULLs.',
      options: [
        ['A', 'INNER JOIN', false],
        ['B', 'LEFT JOIN', true],
        ['C', 'CROSS JOIN', false],
        ['D', 'SELF JOIN', false],
      ] as const,
    },
    {
      title: 'Git staging',
      category: Category.GIT_GITHUB,
      prompt: 'Which command moves changes into the staging area?',
      explanation: 'git add stages changes for the next commit.',
      options: [
        ['A', 'git commit', false],
        ['B', 'git push', false],
        ['C', 'git add', true],
        ['D', 'git stash', false],
      ] as const,
    },
  ];

  const mcqIds: string[] = [];
  for (const seed of mcqSeeds) {
    const existing = await prisma.challenge.findFirst({
      where: { title: seed.title, type: ChallengeType.MCQ },
      select: { id: true },
    });

    if (existing) {
      mcqIds.push(existing.id);
      continue;
    }

    const created = await prisma.challenge.create({
      data: {
        type: ChallengeType.MCQ,
        title: seed.title,
        category: seed.category,
        difficulty: Difficulty.EASY,
        points: 10,
        isPublished: true,
        mcqQuestion: {
          create: {
            prompt: seed.prompt,
            explanation: seed.explanation,
            options: {
              create: seed.options.map(([label, text, isCorrect], orderIndex) => ({
                label,
                text,
                isCorrect,
                orderIndex,
              })),
            },
          },
        },
      },
      select: { id: true },
    });

    mcqIds.push(created.id);
  }

  const codingSeeds = [
    {
      title: 'Sum of two integers',
      statement: 'Read two space-separated integers from stdin and print their sum.',
      starterCodePy: 'a, b = map(int, input().split())\n# print the sum\n',
      starterCodeJs:
        "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\n// print the sum\n",
      points: 20,
      tests: [
        ['1 2', '3', false],
        ['100 250', '350', true],
        ['-5 5', '0', true],
        ['999999 1', '1000000', true],
      ] as const,
    },
    {
      title: 'Reverse a string',
      statement: 'Read one line from stdin and print it reversed.',
      starterCodePy: 's = input()\n# print the reversal\n',
      starterCodeJs:
        "const s = require('fs').readFileSync(0, 'utf8').trim();\n// print the reversal\n",
      points: 20,
      tests: [
        ['hello', 'olleh', false],
        ['faceoff', 'ffoecaf', true],
        ['a', 'a', true],
      ] as const,
    },
  ];

  const codingIds: string[] = [];
  for (const seed of codingSeeds) {
    const existing = await prisma.challenge.findFirst({
      where: { title: seed.title, type: ChallengeType.CODING },
      select: { id: true },
    });

    if (existing) {
      codingIds.push(existing.id);
      continue;
    }

    const created = await prisma.challenge.create({
      data: {
        type: ChallengeType.CODING,
        title: seed.title,
        category: Category.PROGRAMMING_FUNDAMENTALS,
        difficulty: Difficulty.EASY,
        points: seed.points,
        isPublished: true,
        codingChallenge: {
          create: {
            statement: seed.statement,
            starterCodePy: seed.starterCodePy,
            starterCodeJs: seed.starterCodeJs,
            testCases: {
              create: seed.tests.map(([stdin, expectedOutput, isHidden], orderIndex) => ({
                stdin,
                expectedOutput,
                isHidden,
                weight: 1,
                orderIndex,
              })),
            },
          },
        },
      },
      select: { id: true },
    });

    codingIds.push(created.id);
  }

  const knowledge = await prisma.round.upsert({
    where: { competitionId_orderIndex: { competitionId: competition.id, orderIndex: 0 } },
    update: {},
    create: {
      competitionId: competition.id,
      name: 'Round 1 — Knowledge Arena',
      description: 'Multiple-choice questions across the core categories.',
      type: RoundType.MCQ,
      orderIndex: 0,
      weight: 0.4,
    },
  });

  const sprint = await prisma.round.upsert({
    where: { competitionId_orderIndex: { competitionId: competition.id, orderIndex: 1 } },
    update: {},
    create: {
      competitionId: competition.id,
      name: 'Round 2 — Code Sprint',
      description: 'Timed programming problems graded against hidden tests.',
      type: RoundType.CODING,
      orderIndex: 1,
      weight: 0.6,
      allowedLanguages: [Language.PYTHON, Language.JAVASCRIPT],
    },
  });

  await linkChallenges(knowledge.id, mcqIds);
  await linkChallenges(sprint.id, codingIds);

  for (const participant of users.filter((u) => u.role === Role.PARTICIPANT)) {
    await prisma.competitionParticipant.upsert({
      where: {
        competitionId_userId: { competitionId: competition.id, userId: participant.id },
      },
      create: { competitionId: competition.id, userId: participant.id },
      update: {},
    });
  }

  console.log(`Seeded competition "${competition.name}"`);
  console.log(`  ${mcqIds.length} MCQ challenges, ${codingIds.length} coding challenges`);
  console.log(`  accounts (password: ${DEV_PASSWORD}):`);
  for (const user of users) console.log(`    ${user.role.padEnd(12)} ${user.email}`);
}

async function linkChallenges(roundId: string, challengeIds: string[]): Promise<void> {
  await prisma.roundChallenge.deleteMany({ where: { roundId } });
  await prisma.roundChallenge.createMany({
    data: challengeIds.map((challengeId, orderIndex) => ({ roundId, challengeId, orderIndex })),
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
