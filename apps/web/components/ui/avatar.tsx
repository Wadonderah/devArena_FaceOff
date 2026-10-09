'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/// An account's picture, or its initial.
///
/// One component because there were four hand-rolled versions — the rail, the
/// dashboard, the leaderboard rows and the podium — at three different radii
/// and two different fills, which is how a set of avatars stops looking like a
/// set. The design tokens already said what this should be: `rounded-full`
/// "only where a shape is genuinely a circle … avatars" is in globals.css, and
/// three of the four were squares with soft corners.
///
/// A plain `<img>` rather than `next/image`: these are 28–64px, so there is
/// nothing to optimise, and `next/image` would need `remotePatterns` config for
/// a host the CSP already names. `referrerPolicy="no-referrer"` so Google's CDN
/// is not told which page of ours the participant is on.
export function Avatar({
  name,
  src,
  size = 32,
  tone = 'brand',
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  /// `brand` for "this is you", `muted` for everyone else.
  tone?: 'brand' | 'muted';
  className?: string;
}) {
  // A stored URL can 404 — a Google photo the person later removed, say. The
  // initial is the fallback, so the shape never collapses to a broken image.
  const [failed, setFailed] = useState(false);

  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  const showImage = Boolean(src) && !failed;

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold',
        !showImage &&
          (tone === 'brand'
            ? 'bg-gradient-to-br from-brand to-brand-deep text-white'
            : 'bg-surface-3 text-ink-dim'),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {showImage ? (
        /* At 28-64px there is nothing for next/image to optimise, and it would
           need a remotePatterns entry duplicating the host the CSP already
           names. The directive has to be the single line directly above the
           element — spread over several lines it disables the wrong one. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}
