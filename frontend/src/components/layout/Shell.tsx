import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="relative min-h-screen">
      <TopBar />
      <main
        id="app-main-scroll"
        className="relative z-10 min-h-screen overflow-y-auto"
      >
        <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-16 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
