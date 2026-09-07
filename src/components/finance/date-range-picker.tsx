import * as React from 'react';
import { lastNMonths, monthRange, weekRange, today } from '@/lib/date';
import type { DateRange } from '@/lib/date';
import { Input, Label } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';

type Preset = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'last-12' | 'this-week' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'this-week', label: 'Semana' },
  { value: 'this-month', label: 'Este mes' },
  { value: 'last-month', label: 'Mes pasado' },
  { value: 'last-3', label: '3 meses' },
  { value: 'last-6', label: '6 meses' },
  { value: 'last-12', label: '12 meses' },
  { value: 'custom', label: 'Personalizado' },
];

export function rangeFromPreset(preset: Preset): DateRange {
  switch (preset) {
    case 'this-week':
      return weekRange();
    case 'last-month':
      return monthRange(new Date(), -1);
    case 'last-3':
      return lastNMonths(3);
    case 'last-6':
      return lastNMonths(6);
    case 'last-12':
      return lastNMonths(12);
    default:
      return monthRange();
  }
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [preset, setPreset] = React.useState<Preset>('this-month');

  return (
    <div className="space-y-3">
      <Tabs
        size="sm"
        value={preset}
        onChange={(next) => {
          setPreset(next);
          if (next !== 'custom') onChange(rangeFromPreset(next));
        }}
        items={PRESETS}
      />
      {preset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="range-from">Desde</Label>
            <Input
              id="range-from"
              type="date"
              max={value.to}
              value={value.from}
              onChange={(event) => onChange({ ...value, from: event.target.value, label: 'Personalizado' })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="range-to">Hasta</Label>
            <Input
              id="range-to"
              type="date"
              min={value.from}
              max={today()}
              value={value.to}
              onChange={(event) => onChange({ ...value, to: event.target.value, label: 'Personalizado' })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
