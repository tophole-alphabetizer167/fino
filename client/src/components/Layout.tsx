import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CreditCard, ArrowLeftRight, Sparkles, FileUp, Brain } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/accounts', icon: CreditCard, label: 'Accounts' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/learnings', icon: Brain, label: 'Learnings' },
  { to: '/import', icon: FileUp, label: 'Import' },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 border-r border-border/50 bg-card/50 backdrop-blur-md px-3 py-5 flex flex-col">
        <div className="flex items-center gap-2.5 px-3 mb-8">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-base font-semibold tracking-tight">Fino</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t border-border/40">
          <p className="text-[11px] text-muted-foreground/60 font-medium tracking-wide uppercase">Fino</p>
          <p className="text-[11px] text-muted-foreground/40 mt-0.5">Local + Plaid + MCP</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
