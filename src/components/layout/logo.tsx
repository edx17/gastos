import { cn } from '@/lib/utils';
import { brand } from '@/config/brand';

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="clay-tinted flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground">
        {brand.initial}
      </span>
      {showName ? <span className="text-lg font-semibold tracking-tight">{brand.name}</span> : null}
    </div>
  );
}
