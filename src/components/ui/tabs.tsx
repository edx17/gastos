import * as React from 'react';
import { cn } from '@/lib/utils';

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  size = 'default',
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: 'default' | 'sm';
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1', className)}
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === item.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
