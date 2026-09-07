import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { WorkspaceProvider } from '@/providers/workspace-provider';
import { AppShell } from '@/components/layout/app-shell';

/** Guards every `/app/*` route and loads the workspace context once authenticated. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader message="Cargando tu cuenta…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <WorkspaceProvider fallback={<FullScreenLoader message="Preparando tus datos…" />}>
      <AppShell />
    </WorkspaceProvider>
  );
}

export function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
