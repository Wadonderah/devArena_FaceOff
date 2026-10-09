'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/// An account's picture, or its initial as a fallback.
///
/// `referrerPolicy="no-referrer"` keeps Google's CDN from learning which page
/// the viewer is on. Remote hosts must also be allowed by `img-src` in
/// middleware.ts, or the image is blocked with only a console violation.
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
  tone?: 'brand' | 'muted';
  className?: string;
}) {
  // A stored URL can 404 (a removed Google photo); fall back to the initial.
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
        /* Not next/image: at 28-64px there is nothing to optimise, and it
           would need a remotePatterns entry duplicating the CSP's host. */
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
