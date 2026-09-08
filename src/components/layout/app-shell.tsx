import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarDays,
  Home,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Settings,
  Sun,
  Sparkles,
  Tags,
  Target,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { brand } from '@/config/brand';
import { isDemoBackend } from '@/services/data';
import { useAuth } from '@/providers/auth-provider';
import { useWorkspace } from '@/providers/workspace-provider';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from './logo';
import { GlobalSearch } from '@/components/finance/global-search';
import { QuickAddSheet } from '@/components/finance/quick-add-sheet';

const NAV = [
  { to: '/app/dashboard', label: 'Inicio', icon: Home },
  { to: '/app/transactions', label: 'Movimientos', icon: Wallet },
  { to: '/app/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/app/categories', label: 'Categorías', icon: Tags },
  { to: '/app/budgets', label: 'Límites', icon: PiggyBank },
  { to: '/app/goals', label: 'Metas', icon: Target },
  { to: '/app/receipts', label: 'Tickets', icon: Receipt },
  { to: '/app/calendar', label: 'Calendario', icon: CalendarDays },
  { to: '/app/ask', label: 'Preguntar', icon: MessagesSquare },
  { to: '/app/household', label: 'Hogar', icon: Users },
  { to: '/app/plans', label: 'Planes', icon: Sparkles },
];

const MOBILE_NAV = [
  { to: '/app/dashboard', label: 'Inicio', icon: Home },
  { to: '/app/transactions', label: 'Movimientos', icon: Wallet },
  { to: '/app/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/app/settings', label: 'Perfil', icon: Settings },
];

export function AppShell() {
  const { signOut } = useAuth();
  const { profile, client, userId, revision } = useWorkspace();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => setMenuOpen(false), [location.pathname]);

  React.useEffect(() => {
    client
      .listNotifications(userId)
      .then((rows) => setUnread(rows.filter((n) => !n.read_at).length))
      .catch(() => setUnread(0));
  }, [client, userId, revision]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-full bg-background">
      <aside className="clay-panel fixed inset-y-0 left-0 z-30 hidden w-60 flex-col px-3 py-4 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        {isDemoBackend() ? (
          <Badge
            variant="warning"
            className="mt-3 self-start"
            title="La aplicación se compiló sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: los datos quedan en este navegador."
          >
            Modo demo · datos locales
          </Badge>
        ) : null}
        <nav className="mt-6 flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="space-y-1 pt-3">
          <SidebarLink to="/app/settings" label="Ajustes" icon={Settings} />
          <button
            onClick={() => signOut().then(() => navigate('/login'))}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-h-full w-full flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-background/80 px-4 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="lg:hidden">
            <Logo showName={false} />
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            className="clay-inset ml-auto flex h-10 items-center gap-2 rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-72 sm:justify-start"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Buscar movimientos…</span>
            <kbd className="clay-sm ml-auto hidden rounded-full px-2 py-0.5 text-[10px] sm:inline">⌘K</kbd>
          </button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/app/settings#notificaciones')}
            aria-label="Notificaciones"
            className="relative"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" aria-hidden />
            ) : null}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label="Cambiar tema"
          >
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          <Button className="hidden sm:inline-flex" size="sm" onClick={() => setQuickAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation with the primary action in the middle. */}
      <nav className="clay fixed inset-x-0 bottom-0 z-30 rounded-b-none rounded-t-[1.75rem] bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 items-center">
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <BottomLink key={item.to} {...item} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => setQuickAddOpen(true)}
              className="clay-tinted clay-press -mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform"
              aria-label="Agregar movimiento"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {MOBILE_NAV.slice(2).map((item) => (
            <BottomLink key={item.to} {...item} />
          ))}
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setMenuOpen(false)} />
          <div className="clay relative flex h-full w-72 flex-col rounded-l-none p-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <Logo />
              <Button variant="ghost" size="icon-sm" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
              Hola, {profile.display_name}
            </p>
            <nav className="mt-2 flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {NAV.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
              <SidebarLink to="/app/settings" label="Ajustes" icon={Settings} />
            </nav>
            <Button variant="outline" onClick={() => signOut().then(() => navigate('/login'))}>
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {brand.name} · {brand.tagline}
            </p>
          </div>
        </div>
      ) : null}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}

function SidebarLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all',
          isActive
            ? 'clay-sm bg-card text-primary'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )
      }
    >
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  );
}
