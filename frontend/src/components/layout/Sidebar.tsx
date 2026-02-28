import { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../../hooks/useUser';
import { exportProfile, deleteProfile } from '../../api/profiles';

const navItems = [
  { label: 'Overview', sectionId: undefined as string | undefined, path: '/dashboard' },
  { label: 'Sessions', sectionId: 'sessions', path: '/dashboard' },
  { label: 'Topics', sectionId: 'topics', path: '/dashboard' },
  { label: 'Techniques', sectionId: undefined, path: '/dashboard/techniques' },
  { label: 'Week', sectionId: undefined, path: '/dashboard/week' },
  { label: 'Reviews', sectionId: 'reviews', path: '/dashboard' },
];

function scrollWithinDashboard(sectionId?: string) {
  const container = document.getElementById('app-main-scroll');
  if (!container) return;

  if (!sectionId) {
    container.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const target = document.getElementById(sectionId);
  if (!target) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const offset = targetRect.top - containerRect.top + container.scrollTop - 16;

  container.scrollTo({ top: offset, behavior: 'smooth' });
}

export function Sidebar() {
  const { shortId } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleClick = useCallback(
    (item: typeof navItems[0]) => {
      if (item.path === '/dashboard' && item.sectionId !== undefined) {
        // Section within dashboard
        if (location.pathname !== '/dashboard') {
          navigate('/dashboard', { state: { scrollTo: item.sectionId } });
        } else {
          scrollWithinDashboard(item.sectionId);
        }
      } else {
        // Direct navigation to page
        navigate(item.path);
      }
    },
    [location.pathname, navigate],
  );

  const isActive = (item: typeof navItems[0]) => {
    if (item.path === '/dashboard' && item.sectionId === undefined) {
      return location.pathname === '/dashboard';
    }
    if (item.path === '/dashboard/techniques') {
      return location.pathname === '/dashboard/techniques';
    }
    if (item.path === '/dashboard/week') {
      return location.pathname === '/dashboard/week';
    }
    if (item.sectionId === 'sessions') {
      return location.pathname.startsWith('/dashboard/session');
    }
    if (item.sectionId === 'topics') {
      return location.pathname.startsWith('/dashboard/topic');
    }
    if (item.sectionId === 'reviews') {
      return location.pathname === '/dashboard';
    }
    return false;
  };

  const handleExport = async () => {
    try {
      await exportProfile();
    } catch (err) {
      console.error('Failed to export profile:', err);
      alert('Failed to export profile. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    try {
      await deleteProfile();
      alert('All data has been deleted. The page will reload.');
      window.location.reload();
    } catch (err) {
      console.error('Failed to delete profile:', err);
      alert('Failed to delete profile. Please try again.');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
    <aside className="relative z-20 flex h-screen w-64 flex-col border-r border-white/10 glass-strong px-5 py-6 lg:w-64 md:w-20 md:px-3 md:py-5">
      <div className="mb-8 flex items-center justify-between md:justify-center">
        <div className="font-serifDisplay text-xl italic tracking-wide text-accentViolet">
          DeepIt
        </div>
      </div>

      <nav className="flex-1 space-y-1 text-sm">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleClick(item)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-all duration-300 ${
                active
                  ? 'glass-strong text-textPrimary shadow-lg'
                  : 'text-textMuted hover:glass hover:text-textPrimary'
              }`}
            >
              <span className="md:hidden lg:inline">{item.label}</span>
              <span className="hidden text-xs font-medium md:inline lg:hidden">
                {item.label[0]}
              </span>
            </button>
          );
        })}
      </nav>

        <div className="mt-6 border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center justify-between md:flex-col md:items-start md:gap-1">
          <span className="text-xs text-textFaint">User</span>
          <span className="rounded-full glass px-3 py-1 text-[11px] font-monoData text-textMuted">
            {shortId}
          </span>
        </div>
        <button
          type="button"
            onClick={handleExport}
            className="mb-2 flex w-full items-center justify-center rounded-full glass border border-white/10 py-2 text-xs font-medium text-textMuted transition-all hover:border-accentViolet/50 hover:text-textPrimary hover:shadow-lg"
        >
          Export data
        </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex w-full items-center justify-center rounded-full glass border border-white/10 py-2 text-xs font-medium text-accentRed/70 transition-all hover:border-accentRed/50 hover:text-accentRed hover:shadow-lg"
          >
            {showDeleteConfirm ? 'Confirm delete' : 'Delete data'}
          </button>
      </div>
    </aside>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-strong rounded-2xl p-6 max-w-md mx-4">
            <h3 className="mb-2 font-medium text-textPrimary">Delete all data?</h3>
            <p className="mb-4 text-sm text-textMuted">
              This will permanently delete all your learning data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg glass border border-white/10 px-4 py-2 text-sm font-medium text-textPrimary transition-all hover:shadow-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 rounded-lg glass border border-accentRed/50 bg-accentRed/10 px-4 py-2 text-sm font-medium text-accentRed transition-all hover:shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
