import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { Dashboard } from './pages/Dashboard';
import { SessionDetail } from './pages/SessionDetail';
import { TopicDetail } from './pages/TopicDetail';
import { Techniques } from './pages/Techniques';
import { WeeklyReview } from './pages/WeeklyReview';
import { Landing } from './pages/Landing';
import { Onboarding } from './pages/Onboarding';
import { useOnboarding } from './hooks/useOnboarding';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isComplete } = useOnboarding();
  
  if (!isComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="min-h-screen text-textPrimary font-sansUi">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Shell>
                <Dashboard />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/session/:id"
          element={
            <ProtectedRoute>
              <Shell>
                <SessionDetail />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/topic/:slug"
          element={
            <ProtectedRoute>
              <Shell>
                <TopicDetail />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/techniques"
          element={
            <ProtectedRoute>
              <Shell>
                <Techniques />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/week"
          element={
            <ProtectedRoute>
              <Shell>
                <WeeklyReview />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

