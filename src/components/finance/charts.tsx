import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompact, formatMoney } from '@/lib/money';
import { formatDateShort } from '@/lib/date';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CategoryBreakdown, DailyPoint, MonthlyPoint } from '@/types/report';

const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const GRID = 'hsl(var(--border))';

export function ChartCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <div className="px-2 pb-4">{children}</div>
    </Card>
  );
}

function ChartTooltip({ currency }: { currency: string }) {
  return function Rendered({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-lg">
        <p className="mb-1 font-medium">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey ?? entry.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color ?? entry.payload?.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="num font-medium">{formatMoney(Number(entry.value), { currency })}</span>
          </p>
        ))}
      </div>
    );
  };
}

export function CategoryPieChart({
  data,
  currency,
  height = 260,
}: {
  data: CategoryBreakdown[];
  currency: string;
  height?: number;
}) {
  const rows = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="amount" nameKey="category_name" innerRadius="55%" outerRadius="82%" paddingAngle={2}>
          {rows.map((row) => (
            <Cell key={row.category_name} fill={row.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={ChartTooltip({ currency })} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseChart({
  data,
  currency,
  height = 280,
}: {
  data: MonthlyPoint[];
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v), currency)} width={62} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={ChartTooltip({ currency })} />
        <Legend formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
        <Bar dataKey="income" name="Ingresos" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Gastos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SavingsTrendChart({
  data,
  currency,
  height = 260,
}: {
  data: MonthlyPoint[];
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v), currency)} width={62} />
        <Tooltip content={ChartTooltip({ currency })} />
        <Line
          type="monotone"
          dataKey="savings"
          name="Ahorro"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DailySpendChart({
  data,
  currency,
  height = 200,
}: {
  data: DailyPoint[];
  currency: string;
  height?: number;
}) {
  const rows = data.map((point) => ({ ...point, label: formatDateShort(point.date) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v), currency)} width={62} />
        <Tooltip content={ChartTooltip({ currency })} />
        <Area
          type="monotone"
          dataKey="expense"
          name="Gastos"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#spend)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data,
  currency,
  height = 260,
}: {
  data: { label: string; value: number; color?: string }[];
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v), currency)} />
        <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={110} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={ChartTooltip({ currency })} />
        <Bar dataKey="value" name="Total" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((row, index) => (
            <Cell key={row.label} fill={row.color ?? `hsl(var(--primary) / ${1 - index * 0.09})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
