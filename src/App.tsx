import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/error-boundary';
import { FullScreenLoader, ProtectedRoute } from '@/routes/protected-route';

const LandingPage = lazy(() => import('@/pages/landing'));
const LoginPage = lazy(() => import('@/pages/auth/login'));
const RegisterPage = lazy(() => import('@/pages/auth/register'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/forgot-password'));
const DashboardPage = lazy(() => import('@/pages/app/dashboard'));
const TransactionsPage = lazy(() => import('@/pages/app/transactions'));
const ReportsPage = lazy(() => import('@/pages/app/reports'));
const CategoriesPage = lazy(() => import('@/pages/app/categories'));
const BudgetsPage = lazy(() => import('@/pages/app/budgets'));
const GoalsPage = lazy(() => import('@/pages/app/goals'));
const ReceiptsPage = lazy(() => import('@/pages/app/receipts'));
const CalendarPage = lazy(() => import('@/pages/app/calendar'));
const AskPage = lazy(() => import('@/pages/app/ask'));
const HouseholdPage = lazy(() => import('@/pages/app/household'));
const SettingsPage = lazy(() => import('@/pages/app/settings'));
const NotFoundPage = lazy(() => import('@/pages/not-found'));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<FullScreenLoader message="Cargando…" />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                  <Route path="/app" element={<ProtectedRoute />}>
                    <Route index element={<Navigate to="/app/dashboard" replace />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="transactions" element={<TransactionsPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="categories" element={<CategoriesPage />} />
                    <Route path="budgets" element={<BudgetsPage />} />
                    <Route path="goals" element={<GoalsPage />} />
                    <Route path="receipts" element={<ReceiptsPage />} />
                    <Route path="calendar" element={<CalendarPage />} />
                    <Route path="ask" element={<AskPage />} />
                    <Route path="household" element={<HouseholdPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="profile" element={<Navigate to="/app/settings" replace />} />
                  </Route>

                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
