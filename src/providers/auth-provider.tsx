import * as React from 'react';
import { getDataClient } from '@/services/data';
import type { AuthUser } from '@/types/user';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => getDataClient(), []);
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    client
      .getCurrentUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = client.onAuthStateChange((next) => setUser(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        setUser(await client.signIn(email, password));
      },
      signUp: async (email, password, displayName) => {
        setUser(await client.signUp(email, password, displayName));
      },
      signInWithGoogle: () => client.signInWithGoogle(),
      signOut: async () => {
        await client.signOut();
        setUser(null);
      },
      requestPasswordReset: (email) => client.requestPasswordReset(email),
    }),
    [client, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth necesita estar dentro de <AuthProvider>.');
  return context;
}
