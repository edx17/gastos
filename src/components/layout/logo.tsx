import { cn } from '@/lib/utils';
import { brand } from '@/config/brand';

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-sm">
        {brand.initial}
      </span>
      {showName ? <span className="text-lg font-semibold tracking-tight">{brand.name}</span> : null}
    </div>
  );
}
