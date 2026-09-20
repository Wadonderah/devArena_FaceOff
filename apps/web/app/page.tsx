import Link from 'next/link';
import { Arena } from '@/components/arena';
import { Sky } from '@/components/sky';
import { ThemeToggle } from '@/components/theme-toggle';

// Illustrative weights — organizers set their own per competition.
const ROUNDS = [
  {
    tag: 'Round 1',
    name: 'Knowledge Arena',
    copy: 'Multiple-choice across algorithms, data structures, databases, security and Git. Graded on the server the moment you answer, in an order nobody else sees.',
    meta: '20 questions · 10 minutes',
    weight: '30%',
  },
  {
    tag: 'Round 2',
    name: 'Code Sprint',
    copy: 'Timed problems in any of eight languages, executed in a sandboxed judge against test cases you never see. Partial credit for partial progress.',
    meta: '3 problems · 45 minutes',
    weight: '40%',
  },
  {
    tag: 'Round 3',
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
    n: 'I',
    title: 'Scored on the server',
    copy: 'Nothing the browser sends is trusted as a score. Every point is computed server-side, and every result can be reconstructed from what was recorded.',
  },
  {
    n: 'II',
    title: 'Tests you never see',
    copy: 'Solutions are graded against hidden test cases. Reading the samples is not enough — the answer cannot be hard-coded.',
  },
  {
    n: 'III',
    title: 'Isolated execution',
    copy: 'Submitted code runs sandboxed, with CPU, memory and process limits, and no network access at all.',
  },
];

export default function LandingPage() {
  return (
    <main id="main" className="relative isolate">
      <Sky />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto flex max-w-6xl justify-end px-5 pt-5">
          <ThemeToggle />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pt-8 pb-16 sm:pt-12 lg:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-14">
            <div>
              <span className="inline-flex items-center gap-2 border-l-2 border-live pl-3 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-dim">
                Season 1 · Akwannya Hub
              </span>

              {/* Three beats, stacked. The accent lands on one word, on the last
                  line — a tricolour gradient across the whole headline is the
                  single most recognisable stock-template move. */}
              <h1 className="mt-6 font-display text-[clamp(2.75rem,7vw,4.5rem)] font-bold leading-[0.98] tracking-[-0.035em]">
                <span className="block text-ink-dim">Learn.</span>
                <span className="block text-ink">Build.</span>
                <span className="relative inline-block text-brand-bright">
                  Compete.
                  <span
                    aria-hidden
                    className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-live"
                  />
                </span>
              </h1>

              <p className="mt-8 max-w-md text-[17px] leading-relaxed text-ink-dim">
                A live competition for software engineers — not a practice site. Real rounds on a
                real schedule, teams head to head, and a leaderboard the whole room watches move.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="glow-brand inline-flex h-12 items-center rounded-xl bg-brand px-6 text-[15px] font-medium text-white transition-colors hover:bg-brand-bright"
                >
                  Enter the arena
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center rounded-xl border border-line px-6 text-[15px] font-medium text-ink transition-colors hover:border-line-bright hover:bg-surface-2/60"
                >
                  Sign in
                </Link>
              </div>

              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5">
                {[
                  ['Entry', 'Free'],
                  ['Formats', 'Solo & team'],
                  ['Languages', 'Eight, your pick'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-[14px] text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* The stage. Framed like a window onto the event, and allowed to
                run past the column on wide screens so it reads as a place
                rather than a card. First on small screens: it is the hook. */}
            <div className="order-first lg:order-none lg:-mr-10 xl:-mr-20">
              <div className="overflow-hidden rounded-[22px] border border-line/70 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)]">
                <Arena />
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

        <ol className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
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
        </ol>
      </section>

      {/* ── The rounds, framed as a matchup ──────────────────────────────── */}
      <section className="relative border-y border-line bg-surface-1/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-faint">
            The rounds
          </h2>

          <div className="relative mt-8 grid items-stretch gap-4 sm:grid-cols-3">
            {ROUNDS.map((round) => (
              <article
                key={round.tag}
                className="bracketed relative rounded-[14px] border border-line/60 bg-surface-1/60 p-7 backdrop-blur-sm transition-colors hover:border-brand/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-brand-bright">
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

          </div>

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

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {INTEGRITY.map((item) => (
            <div key={item.n} className="border-t border-line pt-5">
              <span className="numeral text-[1.75rem] leading-none">{item.n}</span>
              <h3 className="mt-3 text-[16px]">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-faint">{item.copy}</p>
            </div>
          ))}
        </div>
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
            className="glow-brand mt-8 inline-flex h-12 items-center rounded-xl bg-brand px-7 text-[15px] font-medium text-white transition-colors hover:bg-brand-bright"
          >
            Create an account
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
