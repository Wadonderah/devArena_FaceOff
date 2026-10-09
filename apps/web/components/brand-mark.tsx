import Image from 'next/image';
import { cn } from '@/lib/cn';

/// The compact mark, for places too small for the full logo. Keeps the logo's
/// one legible idea at this size: two sides, teal against orange.
export function Monogram({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path
        d="M9.5 5.5 4.5 12l5 6.5"
        stroke="var(--color-brand-bright)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 5.5 19.5 12l-5 6.5"
        stroke="var(--color-live)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/// The Face-Off lockup: the logo, optionally followed by the wordmark.
///
/// `next/image` matters here — the source is a 1216px asset drawn at 28px, so a
/// plain <img> would ship 646KB to every visitor.
export function BrandMark({
  size = 28,
  showWordmark = true,
  className,
  priority = false,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src="/icon.png"
        // Decorative when the wordmark is beside it, or it is announced twice.
        alt={showWordmark ? '' : 'Face-Off'}
        width={size}
        height={size}
        priority={priority}
        className="shrink-0"
        style={{ width: size, height: size }}
      />
      {showWordmark && (
        // Body stack at text-sm, not font-display: the display face sits on a
        // different baseline from the nav links beside it.
        <span className="text-sm font-semibold tracking-tight">Face-Off</span>
      )}
    </span>
  );
}

/// The brand's two-sided mark as a panel rule: two colours meeting at a gap.
///
/// Orange appears here *structurally* only. As a status it stays on badges with
/// motion, which is what keeps "happening now" meaning something.
export function FaceOffRule({ live = false }: { live?: boolean }) {
  return (
    <div aria-hidden className="flex h-[3px] w-full">
      {/* Complete alternatives, never a base plus an override: `cn` is a plain
          join with no tailwind-merge, so both classes would survive and CSS
          source order would decide. Every conditional style here is a ternary
          for this reason. */}
      <span
        className={
          live
            ? 'flex-1 bg-gradient-to-r from-transparent to-brand-bright'
            : 'flex-1 bg-gradient-to-r from-transparent to-brand'
        }
      />
      {/* The two sides must not touch. */}
      <span className="w-2 shrink-0" />
      <span
        className={
          live
            ? 'flex-1 animate-pulse bg-gradient-to-r from-live-soft to-transparent'
            : 'flex-1 bg-gradient-to-r from-live to-transparent'
        }
      />
    </div>
  );
}
