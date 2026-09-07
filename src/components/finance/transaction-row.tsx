import { Paperclip, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import { humanDate } from '@/lib/date';
import type { CategoryTree } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import { CategoryBadge } from './category-badge';

export function TransactionRow({
  transaction,
  categories,
  paymentMethodName,
  onClick,
  highlighted,
}: {
  transaction: Transaction;
  categories: CategoryTree[];
  paymentMethodName?: string;
  onClick?: () => void;
  highlighted?: boolean;
}) {
  const category = categories.find((c) => c.id === transaction.category_id);
  const subcategory = category?.subcategories.find((s) => s.id === transaction.subcategory_id);
  const incoming = transaction.type === 'income' || transaction.type === 'refund';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-0 hover:bg-accent/50',
        highlighted && 'bg-accent',
      )}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          backgroundColor: `${category?.color ?? '#94a3b8'}1a`,
          color: category?.color ?? '#64748b',
        }}
        aria-hidden
      >
        {(transaction.merchant_name || transaction.description || '?').slice(0, 2).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{transaction.description}</p>
          {transaction.receipt_id ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
          {transaction.is_recurring ? <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{humanDate(transaction.transaction_date)}</span>
          {category ? (
            <CategoryBadge name={category.name} subcategory={subcategory?.name} color={category.color} size="sm" />
          ) : null}
          {paymentMethodName ? <span>· {paymentMethodName}</span> : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn('num text-sm font-semibold', incoming ? 'text-success' : 'text-foreground')}>
          {incoming ? '+' : '-'}
          {formatMoney(transaction.amount, { currency: transaction.currency })}
        </p>
        {transaction.currency !== transaction.base_currency ? (
          <p className="text-[11px] text-muted-foreground">
            ≈ {formatMoney(transaction.base_amount, { currency: transaction.base_currency })}
          </p>
        ) : null}
      </div>
    </button>
  );
}
