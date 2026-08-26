import { cn } from '@/lib/cn';

/// Skeletons rather than spinners: reserving the final layout stops content from
/// jumping when it lands, which matters most on the leaderboard where rows shift.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2',
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
