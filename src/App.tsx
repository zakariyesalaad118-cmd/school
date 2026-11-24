import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './i18n';
import { AppShell } from './layouts/AppShell';
import { AttendancePage } from './pages/AttendancePage';
import { BrandingSettingsPage } from './pages/BrandingSettingsPage';
import { DashboardBuilderPage } from './pages/DashboardBuilderPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { DynamicDashboardPage } from './pages/DynamicDashboardPage';
import { ExamsPage } from './pages/ExamsPage';
import { LoginPage } from './pages/LoginPage';
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { RolesPage } from './pages/RolesPage';
import { SecurityAuditPage } from './pages/SecurityAuditPage';
import { StudentList } from './pages/StudentList';
import { UsersPage } from './pages/UsersPage';
import type { SystemModule } from './types/nexus';

function ProtectedRoute({
  module,
  children,
}: {
  module?: SystemModule;
  children: React.ReactNode;
}) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (module) {
    const allowed =
      can(module, 'view') ||
      (module === 'attendance' && (can('attendance', 'create') || can('attendance', 'edit'))) ||
      (module === 'exams' &&
        (can('exams', 'create') || can('exams', 'edit') || can('exams', 'approve')));
    if (!allowed) return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { loading, setupRequired, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        NEXUS SCHOOL OS...
      </div>
    );
  }

  if (setupRequired || !user || user.mustChangePassword) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DynamicDashboardPage />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute module="users">
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute module="roles">
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/departments"
          element={
            <ProtectedRoute module="departments">
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboards"
          element={
            <ProtectedRoute module="dashboards">
              <DashboardBuilderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/branding"
          element={
            <ProtectedRoute module="branding">
              <BrandingSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/security"
          element={
            <ProtectedRoute module="security">
              <SecurityAuditPage />
            </ProtectedRoute>
          }
        />
        <Route path="/profile" element={<ProfileSettingsPage />} />

        <Route
          path="/modules/students"
          element={
            <ProtectedRoute module="students">
              <StudentList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students"
          element={
            <ProtectedRoute module="students">
              <StudentList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/modules/attendance"
          element={
            <ProtectedRoute module="attendance">
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute module="attendance">
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/modules/exams"
          element={
            <ProtectedRoute module="exams">
              <ExamsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/exams"
          element={
            <ProtectedRoute module="exams">
              <ExamsPage />
            </ProtectedRoute>
          }
        />

        {/* Remaining Phase 2+ Provisioned School Modules */}
        {(
          [
            'teachers',
            'academics',
            'finance',
            'library',
            'transport',
            'hr',
            'reports',
          ] as SystemModule[]
        ).map((mod) => (
          <Route
            key={mod}
            path={`/modules/${mod}`}
            element={
              <ProtectedRoute module={mod}>
                <ModulePlaceholderPage moduleKey={mod} />
              </ProtectedRoute>
            }
          />
        ))}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <BrandingProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
