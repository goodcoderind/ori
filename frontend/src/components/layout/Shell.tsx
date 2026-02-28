import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="relative flex min-h-screen text-textPrimary">
      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col">
        <TopBar />
        <main
          id="app-main-scroll"
          className="relative z-10 flex-1 overflow-y-auto px-8 py-6 lg:px-12 lg:py-8"
        >
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

