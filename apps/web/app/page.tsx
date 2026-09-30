import Link from 'next/link';
import { Arena } from '@/components/arena';
import { Sky } from '@/components/sky';
import { Reveal } from '@/components/reveal';
import {
  ArrowRight,
  Bug,
  Code2,
  EyeOff,
  ListChecks,
  ServerCog,
  ShieldCheck,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

// Illustrative weights — organizers set their own per competition.
const ROUNDS = [
  {
    tag: 'Round 1',
    icon: ListChecks,
    name: 'Knowledge Arena',
    copy: 'Multiple-choice across algorithms, data structures, databases, security and Git. Graded on the server the moment you answer, in an order nobody else sees.',
    meta: '20 questions · 10 minutes',
    weight: '30%',
  },
  {
    tag: 'Round 2',
    icon: Code2,
    name: 'Code Sprint',
    copy: 'Timed problems in any of eight languages, executed in a sandboxed judge against test cases you never see. Partial credit for partial progress.',
    meta: '3 problems · 45 minutes',
    weight: '40%',
  },
  {
    tag: 'Round 3',
    icon: Bug,
    name: 'Bug Hunt',
    copy: 'A bug report, the failing output, and broken code that compiles. Find the fault and fix it — hidden tests decide whether you actually did.',
    meta: '2 bugs · 30 minutes',
    weight: '30%',
  },
];

const TIMELINE = [
  { step: '01', title: 'Register', copy: 'Create an account and join the competition.' },
  { step: '02', title: 'Form a team', copy: 'Start a team, or join one with a six-character code.' },
  { step: '03', title: 'Knowledge Arena', copy: 'Answer under the clock. Scored the instant you submit.' },
  { step: '04', title: 'Code Sprint', copy: 'Write real code. Run it. Submit it. Watch it judged.' },
  { step: '05', title: 'Bug Hunt', copy: 'Read the report, find the fault, make the tests pass.' },
  { step: '06', title: 'Final standings', copy: 'Weighted across rounds, tie-breaks applied.' },
];

const INTEGRITY = [
  {
    icon: ServerCog,
    title: 'Scored on the server',
    copy: 'Nothing the browser sends is trusted as a score. Every point is computed server-side, and every result can be reconstructed from what was recorded.',
  },
  {
    icon: EyeOff,
    title: 'Tests you never see',
    copy: 'Solutions are graded against hidden test cases. Reading the samples is not enough — the answer cannot be hard-coded.',
  },
  {
    icon: ShieldCheck,
    title: 'Isolated execution',
    copy: 'Submitted code runs sandboxed, with CPU, memory and process limits, and no network access at all.',
  },
];

export default function LandingPage() {
  return (
    <main id="main" className="page-frame relative isolate">
      <Sky />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/*
          The arena is the backdrop now, not a panel beside the copy. It stands
          on the horizon the sky draws, scaled past the viewport so the outer
          orbits run off both edges — the page is inside the arena rather than
          looking at a picture of one.

          Offset right so the bowl clears the headline: the copy is
          left-aligned, and legibility beats symmetry.
        */}
        <div
          aria-hidden
          className="arena-backdrop pointer-events-none absolute bottom-0 left-1/2 z-0 w-[200%] max-w-none -translate-x-1/2 translate-y-[22%] sm:w-[150%] lg:w-[112%]"
        >
          <Arena backdrop />
        </div>

        <div aria-hidden className="hero-scrim pointer-events-none absolute inset-0 z-0" />

        <div className="relative z-10 mx-auto flex max-w-6xl justify-end px-5 pt-5">
          <ThemeToggle />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[86vh] max-w-6xl flex-col justify-center px-5 pt-8 pb-28 sm:pt-12 lg:pb-36">
          {/*
            Centred on the stage. The arena is radially symmetric, so copy
            pushed to one side fought it — Parlo and mantality both centre over
            their backdrop for the same reason. The eyebrow loses its left rule
            and becomes a pill, since a left border has nothing to sit against
            once the block is centred.
          */}
          <div className="mx-auto max-w-3xl text-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1/60 px-3.5 py-1.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-dim backdrop-blur-sm">
                <span aria-hidden className="size-1.5 rounded-full bg-live" />
                Season 1 · Akwannya Hub
              </span>

              {/* Three beats, stacked. The accent lands on one word, on the last
                  line — a tricolour gradient across the whole headline is the
                  single most recognisable stock-template move. */}
              {/*
                One wide line rather than three stacked words. Stacked, each
                line held a single short word — a tall, narrow column, which is
                what actually left the flanks of a centred hero empty. Set
                across, the block spans the stage, and the second line carries
                the extra length without a separate section crowding the arena.
              */}
              <h1 className="mt-7 font-display text-[clamp(2rem,5.6vw,3.9rem)] font-bold leading-[1.06] tracking-[-0.035em]">
                <span className="text-ink-dim">Learn.</span>{' '}
                <span className="text-ink">Build.</span>{' '}
                <span className="relative inline-block text-brand-bright">
                  Compete.
                  <span
                    aria-hidden
                    className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-live"
                  />
                </span>
                {/* ink-dim, not ink-faint: this is the headline continuing,
                    not a caption, and it sits over the busiest part of the
                    backdrop. */}
                <span className="mt-4 block font-medium text-ink-dim">
                  Then do it again, faster.
                </span>
              </h1>

              <p className="mx-auto mt-8 max-w-lg text-[17px] leading-relaxed text-ink-dim">
                A live competition for software engineers, not a practice site. Real rounds on a
                real schedule, teams head to head, and a leaderboard the whole room watches move.
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/register"
                  className="glow-brand inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-white transition-colors hover:bg-brand-bright"
                >
                  Enter the arena
                  <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center rounded-full border border-line px-6 text-[15px] font-medium text-ink transition-colors hover:border-line-bright hover:bg-surface-2/60"
                >
                  Sign in
                </Link>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── How it runs ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="rule-fade" aria-hidden />

        <h2 className="mt-12 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-faint">
          How a Face-Off runs
        </h2>

        <Reveal><ol className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {TIMELINE.map((item, i) => (
            <li key={item.step} className="group relative">
              {/* Connector, drawn only between items on a single row. */}
              {i < TIMELINE.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-4 left-[3.25rem] hidden h-px w-[calc(100%-2.5rem)] bg-gradient-to-r from-line-bright to-transparent lg:block"
                />
              )}

              <span
                className={`numeral text-[2.5rem] leading-none ${i === 0 ? 'numeral-active' : ''}`}
              >
                {item.step}
              </span>

              <h3 className="mt-3 text-[16px]">{item.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-dim">{item.copy}</p>
            </li>
          ))}
        </ol></Reveal>
      </section>

      {/* ── The rounds, framed as a matchup ──────────────────────────────── */}
      <section className="relative border-y border-line bg-surface-1/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-faint">
            The rounds
          </h2>

          <Reveal className="relative mt-8 grid items-stretch gap-4 sm:grid-cols-3">
            {ROUNDS.map((round) => (
              <article
                key={round.tag}
                className="bracketed relative rounded-[14px] border border-line/60 bg-surface-1/60 p-7 backdrop-blur-sm transition-colors hover:border-brand/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.14em] text-brand-bright">
                    <round.icon aria-hidden size={15} strokeWidth={1.5} />
                    {round.tag}
                  </span>
                  <span className="tabular font-display text-2xl text-ink-dim">
                    {round.weight}
                  </span>
                </div>

                <h3 className="mt-3 font-display text-2xl tracking-[-0.02em]">{round.name}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">{round.copy}</p>
                <p className="mt-5 border-t border-line pt-3 font-mono text-[12px] text-ink-faint">
                  {round.meta}
                </p>
              </article>
            ))}

          </Reveal>

          <p className="mt-6 text-[14px] text-ink-faint">
            Round weights combine into one final score. Ties break on challenges completed, then
            total time, then who got there first.
          </p>
        </div>
      </section>

      {/* ── Integrity ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.25rem)] leading-tight tracking-[-0.025em]">
            Built so the result
            <br />
            <span className="text-brand-bright">actually means something</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            A competition is only worth entering if it cannot be gamed. These are not features —
            they are the reason the leaderboard can be trusted.
          </p>
        </div>

        <Reveal className="mt-10 grid gap-8 sm:grid-cols-3">
          {INTEGRITY.map((item) => (
            <div key={item.title} className="border-t border-line pt-5">
              <span className="grid size-9 place-items-center rounded-xl border border-line bg-surface-2 text-brand-bright">
                <item.icon aria-hidden size={17} strokeWidth={1.5} />
              </span>
              <h3 className="mt-3 text-[16px]">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-faint">{item.copy}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── Close ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-line">

        <div className="relative mx-auto max-w-6xl px-5 py-24 text-center">
          <h2 className="font-display text-[clamp(2rem,5vw,3rem)] font-bold tracking-[-0.03em]">
            Take your place on the board
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-ink-dim">
            Create an account, form a team, and see how far you get.
          </p>

          <Link
            href="/register"
            className="glow-brand mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px] font-medium text-white transition-colors hover:bg-brand-bright"
          >
            Create an account
            <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
          </Link>

          <p className="mt-16 font-mono text-[12px] tracking-wide text-ink-faint">
            Software Engineering Face-Off · An{' '}
            <a
              href="https://akwannya-hub.org"
              className="text-ink-dim underline underline-offset-4 transition-colors hover:text-brand-bright"
              target="_blank"
              rel="noreferrer"
            >
              Akwannya Hub
            </a>{' '}
            program
          </p>
        </div>
      </section>
    </main>
  );
}
