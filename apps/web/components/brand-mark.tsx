import Image from 'next/image';
import { cn } from '@/lib/cn';

/// The compact mark, for places the full logo cannot survive.
///
/// The logo proper is a detailed circular illustration: two teams at laptops
/// either side of a divider. It needs room. In a 56px nav bar it either becomes
/// an unreadable colour blob or, sized to be legible, fills half the bar and
/// reads as an avatar. This keeps the one idea that still works small — the
/// two-sided split, teal against orange — and drops everything that does not.
///
/// Inline SVG rather than another raster: crisp at any size, no network
/// request, and the two colours are theme tokens, so it follows light and dark
/// without a second asset.
///
/// The chevrons double as angle brackets, which is the right association for a
/// competition judged on code.
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
/// One component rather than the markup repeated per page, because the previous
/// arrangement was a hand-rolled gradient tile with a letter "F" in it, copied
/// into two files and already drifting — one had kept a gradient the other had
/// dropped. A real logo should only ever be described once.
///
/// `next/image` rather than a plain <img>: the source is a 1216px asset being
/// drawn at 28px, and Next resizes and serves a modern format instead of
/// shipping 646KB to every visitor.
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
        // Empty alt is the decorative case, and it is correct whenever the
        // wordmark is beside it: the text already names the product, and a
        // screen reader reading both would announce it twice. With no wordmark
        // the image is the only label, so it gets a real one.
        alt={showWordmark ? '' : 'Face-Off'}
        width={size}
        height={size}
        // `priority` only where the mark is above the fold on first paint, so
        // the rest do not compete with content for bandwidth.
        priority={priority}
        className="shrink-0"
        style={{ width: size, height: size }}
      />
      {showWordmark && (
        // Set in the body stack at text-sm, deliberately NOT font-display at
        // 15px. The display face at a larger size sat on a different baseline
        // and weight from the 14px nav links beside it, which is what made the
        // header look misaligned — the fix is matching the row it belongs to,
        // not deleting the word.
        <span className="text-sm font-semibold tracking-tight">Face-Off</span>
      )}
    </span>
  );
}
