import type { ReactNode } from 'react';
import type { LearnerState } from '../../types/states';
import { stateColors } from '../../utils/stateColors';

export type BadgeVariant = LearnerState | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  const color = variant === 'neutral' ? '#8A89A4' : stateColors[variant];
  const bg = `${color}26`; // ~15% opacity

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium font-sansUi tracking-wide ${className ?? ''}`}
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

