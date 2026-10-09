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

/// The brand's two-sided mark, drawn as a rule.
///
/// The logo is a face-off: two teams either side of a divider, teal against
/// orange. Until this existed the only place that idea survived in the app was
/// the 24px monogram in the rail, and the palette note said orange was reserved
/// for "happening now" and nothing else — so on any page without a live round,
/// half the brand was simply absent.
///
/// Two colours meeting in the middle with a gap between them says what the
/// product is, and it does it structurally rather than as a status. That
/// distinction is what keeps the live signal intact: orange here is never a
/// badge, never text and never a number. It is the edge of a panel. Orange as
/// *state* still only ever appears on a badge, with motion — a different
/// register that still reads as "now".
export function FaceOffRule({ live = false }: { live?: boolean }) {
  return (
    <div aria-hidden className="flex h-[3px] w-full">
      {/* Complete alternatives rather than a base plus an override: `cn` is a
          plain join with no tailwind-merge, so `to-brand` and `to-brand-bright`
          would both land in the class list and CSS source order would pick the
          winner. Every conditional style in this codebase is a ternary for
          exactly that reason. */}
      <span
        className={
          live
            ? 'flex-1 bg-gradient-to-r from-transparent to-brand-bright'
            : 'flex-1 bg-gradient-to-r from-transparent to-brand'
        }
      />
      {/* The divider. The whole mark depends on the two sides not touching. */}
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
