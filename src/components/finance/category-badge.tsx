import { cn } from '@/lib/utils';

export function CategoryBadge({
  name,
  subcategory,
  color = '#0f766e',
  className,
  size = 'default',
}: {
  name: string;
  subcategory?: string | null;
  color?: string;
  className?: string;
  size?: 'default' | 'sm';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">{name}</span>
      {subcategory ? <span className="truncate text-muted-foreground">· {subcategory}</span> : null}
    </span>
  );
}
