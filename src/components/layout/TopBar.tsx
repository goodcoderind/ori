import { useUser } from '../../hooks/useUser';

export function TopBar() {
  const { shortId } = useUser();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 glass-strong px-12 py-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-textMuted">
          {greeting}, learner.
        </span>
        <span className="font-serifDisplay text-xl italic text-textPrimary">
          Here&apos;s how you&apos;ve been learning.
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden text-xs text-textFaint md:inline">
          ID
        </span>
        <span className="rounded-full glass px-3 py-1 text-[11px] font-monoData text-textMuted">
          {shortId}
        </span>
        <button
          type="button"
          className="rounded-full glass border border-accentViolet/40 px-4 py-1.5 text-xs font-medium text-accentViolet transition-all hover:border-accentViolet/60 hover:shadow-lg hover:shadow-accentViolet/20"
        >
          Export snapshot
        </button>
      </div>
    </header>
  );
}

