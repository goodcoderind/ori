import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number; // 0–1
  color?: string;
  animated?: boolean;
  height?: number;
}

export function ProgressBar({
  value,
  color = '#E0E0E0',
  animated = true,
  height = 6,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div
      className="w-full overflow-hidden rounded-full bg-surfaceRaised/60"
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${color}, #B0B0B0)`,
        }}
        initial={animated ? { width: 0 } : { width: `${clamped * 100}%` }}
        animate={{ width: `${clamped * 100}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

