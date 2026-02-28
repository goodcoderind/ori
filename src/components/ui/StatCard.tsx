import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  accentColor?: string;
}

export function StatCard({ label, value, delta, accentColor }: StatCardProps) {
  return (
    <Card
      accentColor={accentColor ?? '#7C6EF5'}
      className="flex flex-col gap-2"
      hoverable
    >
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
        {label}
      </div>
      <div className="text-2xl font-monoData">{value}</div>
      {delta && (
        <div className="text-xs text-textMuted">
          {delta}
        </div>
      )}
    </Card>
  );
}

