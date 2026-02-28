import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface ShellProps {
  children: ReactNode;
  showTopBar?: boolean;
}

export function Shell({ children, showTopBar = true }: ShellProps) {
  return (
    <div className="relative h-screen flex flex-col overflow-hidden">
      {showTopBar && <TopBar />}
      <main
        id="app-main-scroll"
        className="relative z-10 flex-1 overflow-hidden"
      >
        <div className="mx-auto max-w-[1800px] h-full px-2 py-2 lg:px-4 lg:py-4">
          {children}
        </div>
      </main>
    </div>
  );
}
