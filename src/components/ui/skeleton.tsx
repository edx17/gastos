import { cn } from '@/lib/utils';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('relative overflow-hidden rounded-md bg-muted', className)}>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/60 to-transparent" />
  </div>
);

export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => (
  <div className="card-surface space-y-3 p-5">
    <Skeleton className="h-4 w-1/3" />
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} className="h-8 w-full" />
    ))}
  </div>
);
