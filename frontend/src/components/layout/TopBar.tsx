export function TopBar() {
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <header className="sticky top-0 z-30 mb-8 flex items-center justify-between border-b border-white/10 glass-strong px-6 py-6 backdrop-blur-xl lg:px-16">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-textMuted">
          {greeting} Shamam.
        </span>
        <span className="font-serifDisplay text-3xl italic leading-tight text-textPrimary">
          Here&apos;s how you&apos;ve been learning.
        </span>
      </div>
    </header>
  );
}
