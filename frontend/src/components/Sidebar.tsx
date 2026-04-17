import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Settings,
  LogOut,
  LogIn,
  Menu,
  X,
  CreditCard,
  User,
  Activity,
  BarChart2,
  Network,
  Terminal,
  ShoppingCart,
  MessageSquare,
  ChevronLeft,
  Flame,
  Zap,
} from "lucide-react";
import { useBasket } from "@/basket/BasketContext";
import { useFeedback } from "@/feedback/FeedbackContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AuthUser } from "@/auth/AuthContext";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/", key: 'home' },
  { icon: BookOpen, label: "Exams", href: "/exams", key: 'practice' },
  { icon: Activity, label: "Analytics", href: "/analytics", key: 'analytics' },
  { icon: BarChart2, label: "Metrics", href: "/metrics", key: 'metrics' },
  { icon: Network, label: "Diagrams", href: "/diagrams", key: 'diagrams' },
  { icon: Terminal, label: "Skill Labs", href: "/skill-labs", key: 'skill-labs' },
  { icon: MessageSquare, label: "Feedback", href: "/feedback", key: 'feedback' },
  { icon: User, label: "Account", href: "/account", key: 'account' },
  { icon: CreditCard, label: "Pricing", href: "/pricing", key: 'pricing' },
  { icon: ShoppingCart, label: "Basket", href: "/basket", key: 'basket' },
  { icon: Settings, label: "Admin", href: "/admin", key: 'admin' },
];

interface SidebarProps {
  className?: string;
  currentRoute?: string;
  onNavigate?: (key: string) => void;
  logout?: () => void;
  login?: () => void;
  user?: AuthUser | null;
  xp?: number;
  level?: number;
  streak?: number;
  showAdmin?: boolean;
  collapsed?: boolean;
  onCollapse?: (v: boolean) => void;
}

export function Sidebar({ className, currentRoute, onNavigate, logout, login, user, xp, level, streak, showAdmin, collapsed: collapsedProp, onCollapse }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = onCollapse ?? setInternalCollapsed;
  const navigate = useNavigate();
  const { itemCount: basketCount } = useBasket();
  const { badgeCount: feedbackCount } = useFeedback();

  const handleNav = (key: string, href: string) => {
    setMobileOpen(false);
    if (onNavigate) {
      onNavigate(key);
    } else {
      navigate(href);
    }
  };

  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center border-b border-sidebar-border overflow-hidden shrink-0">
        {!isMobile && collapsed ? (
          <div className="flex items-center justify-center w-14">
            <img src="/favicon.png" alt="certshack" className="h-7 w-7 object-contain rounded-lg bg-white" />
          </div>
        ) : (
          <span className="px-6 text-xl font-bold tracking-tight text-sidebar-foreground flex items-center gap-2 whitespace-nowrap">
            <img src="/favicon.png" alt="certshack" className="h-7 w-7 object-contain rounded-lg bg-white" />
            certshack
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className={cn("flex-1 overflow-y-auto py-6 space-y-1", (!isMobile && collapsed) ? "px-0" : "px-2")}>
        {navItems.filter(item => {
          if (item.key === 'admin' || item.key === 'diagrams' || item.key === 'metrics') return showAdmin
          if (item.key === 'feedback') return !!user
          return true
        }).map((item) => {
          const isActive = currentRoute === item.key || (item.key === 'skill-labs' && currentRoute?.startsWith('skill-lab:'))
          const isCollapsed = !isMobile && collapsed
          const badge = item.key === 'basket' && basketCount > 0 ? basketCount
            : item.key === 'feedback' && feedbackCount > 0 ? feedbackCount
            : null
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key, item.href)}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-3 py-2.5 text-sm font-medium rounded-md transition-colors relative",
                isCollapsed ? "w-14 justify-center px-0" : "w-full px-3",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground")} />
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              {badge !== null && (
                isCollapsed ? (
                  <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold">
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-sidebar-border space-y-2 shrink-0", (!isMobile && collapsed) ? "p-0 py-2" : "p-4")}>
        {(isMobile || !collapsed) && (
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        )}
        {(isMobile || !collapsed) && user ? (
          <>
            {(xp !== undefined || streak !== undefined) && (
              <div className="px-3 py-1 flex items-center gap-2 text-[11px] text-sidebar-foreground/60">
                {level !== undefined && <span className="flex items-center gap-0.5"><Zap className="w-3 h-3 text-yellow-400" />Lv{level}</span>}
                {xp !== undefined && <span>{xp} XP</span>}
                {typeof streak === 'number' && streak > 0 && <span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-orange-400" />{streak}d</span>}
              </div>
            )}
            <div className="px-3 py-1.5 text-xs text-sidebar-foreground/70 font-medium truncate" title={user.name}>
              {user.name}
            </div>
            <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </>
        ) : !isMobile && collapsed && user ? (
          <button
            title="Log out"
            className="w-14 flex items-center justify-center py-2 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : (isMobile || !collapsed) ? (
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50" onClick={() => navigate('/login')}>
            <LogIn className="mr-2 h-4 w-4" />
            Log in
          </Button>
        ) : (
          <button
            title="Log in"
            className="w-14 flex items-center justify-center py-2 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
            onClick={() => navigate('/login')}
          >
            <LogIn className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ─── Mobile: hamburger + overlay drawer ─── */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Button variant="outline" size="icon" onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — always full w-64, slides in/out */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col text-sidebar-foreground transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </aside>

      {/* ─── Desktop: static sidebar with collapse ─── */}
      <div
        className={cn(
          "hidden md:flex relative shrink-0 group/sidebar",
          className
        )}
      >
        {/* Animated-width wrapper clips content during transition */}
        <div className={cn(
          "h-full transition-[width] duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-14" : "w-64"
        )}>
          <aside className="h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col text-sidebar-foreground">
            {sidebarContent(false)}
          </aside>
        </div>

        {/* Reddit-style collapse pill on sidebar edge */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand Navigation' : 'Collapse Navigation'}
          className="group/btn absolute -right-3 top-[4.5rem] z-50 flex items-center justify-center w-6 h-6 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-all opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100"
        >
          <ChevronLeft className={cn('w-3.5 h-3.5 transition-transform duration-300', collapsed && 'rotate-180')} />
          {/* Tooltip */}
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2 py-1 rounded-md bg-foreground text-background text-xs font-medium whitespace-nowrap opacity-0 scale-95 group-hover/btn:opacity-100 group-hover/btn:scale-100 transition-all duration-150 delay-300">
            {collapsed ? 'Expand Navigation' : 'Collapse Navigation'}
          </span>
        </button>
      </div>
    </>
  );
}
