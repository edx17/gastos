import { SUPPORTED_CURRENCIES, currencyDef } from '@/lib/money';
import { Select } from '@/components/ui/input';
import type { CurrencyCode } from '@/types/currency';

export function CurrencySelector({
  value,
  onChange,
  options = SUPPORTED_CURRENCIES,
  id,
  className,
}: {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  options?: CurrencyCode[];
  id?: string;
  className?: string;
}) {
  const list = options.includes(value) ? options : [...options, value];
  return (
    <Select id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)}>
      {list.map((code) => (
        <option key={code} value={code}>
          {code} · {currencyDef(code).name}
        </option>
      ))}
    </Select>
  );
}
