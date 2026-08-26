import Link from 'next/link';

const ROUNDS = [
  {
    tag: 'Round 1',
    name: 'Knowledge Arena',
    copy: 'Multiple-choice questions across algorithms, data structures, databases and Git. Server-graded, timed, no second guesses.',
  },
  {
    tag: 'Round 2',
    name: 'Code Sprint',
    copy: 'Timed programming problems executed in a sandboxed judge against hidden test cases. Partial credit for partial progress.',
  },
];

export default function LandingPage() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
      <section className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/70 px-3 py-1 text-[12px] text-ink-dim">
          <span aria-hidden className="size-1.5 rounded-full bg-live" />
          Season 1 · Akwannya Hub
        </span>

        <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          Learn. Build. Compete.
          <span className="block bg-gradient-to-r from-brand-bright via-brand to-live bg-clip-text text-transparent">
            Prove your engineering skills.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-dim">
          A competition built for software engineers, not quiz takers. Two rounds,
          real code, and a leaderboard that updates while you watch.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="inline-flex h-12 items-center rounded-xl bg-brand px-6 text-[15px] font-medium text-white shadow-[0_8px_28px_-10px_rgba(109,94,248,0.9)] transition-colors hover:bg-brand-bright"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-xl border border-line bg-surface-2 px-6 text-[15px] font-medium text-ink transition-colors hover:border-line-bright"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-2">
        {ROUNDS.map((round) => (
          <article key={round.tag} className="panel hairline p-6">
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-brand-bright">
              {round.tag}
            </span>
            <h2 className="mt-2 text-xl">{round.name}</h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">{round.copy}</p>
          </article>
        ))}
      </section>

      <section className="mt-14 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-3">
        {[
          ['Server-side scoring', 'Nothing the browser sends is trusted as a score.'],
          ['Hidden test cases', 'Your solution is graded on tests you never see.'],
          ['Sandboxed execution', 'Code runs isolated, resource-capped, with no network.'],
        ].map(([title, copy]) => (
          <div key={title} className="bg-surface-1 p-5">
            <h3 className="text-[15px]">{title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-faint">{copy}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
