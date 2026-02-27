import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import AttendancePage from "./pages/AttendancePage";
import AttendanceHistoryPage from "./pages/AttendanceHistoryPage";
import MarksPage from "./pages/MarksPage";
import TimetablePage from "./pages/TimetablePage";
import TimetableHistoryPage from "./pages/TimetableHistoryPage";
import ProfilePage from "./pages/ProfilePage";
import NotFoundPage from "./pages/NotFoundPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { teacher, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!teacher) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  const { teacher } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Navigate to={teacher ? "/dashboard" : "/auth"} replace />} />
      <Route path="/auth" element={teacher ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="attendance/:date" element={<AttendancePage />} />
        <Route path="attendance-history" element={<AttendanceHistoryPage />} />
        <Route path="marks" element={<MarksPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="timetable-history" element={<TimetableHistoryPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
