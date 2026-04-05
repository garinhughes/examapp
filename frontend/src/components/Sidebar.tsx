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
} from "lucide-react";
import { useBasket } from "@/basket/BasketContext";
import { useFeedback } from "@/feedback/FeedbackContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AuthUser } from "@/auth/AuthContext";



// Map routes to internal App state keys
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
}

export function Sidebar({ className, currentRoute, onNavigate, logout, login, user, xp, level, streak, showAdmin }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { itemCount: basketCount } = useBasket();
  const { badgeCount: feedbackCount } = useFeedback();

  const toggle = () => setIsOpen(!isOpen);

  const handleNav = (key: string, href: string) => {
    setIsOpen(false);
    if (onNavigate) {
      onNavigate(key);
    } else {
      navigate(href);
    }
  };

  return (
    <>
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Button variant="outline" size="icon" onClick={toggle}>
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-all"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside 
        className={cn(
          "fixed top-7 bottom-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 md:translate-x-0 md:static flex flex-col md:h-full text-sidebar-foreground",
          isOpen ? "translate-x-0" : "-translate-x-full",
          className
        )}
      >
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground flex items-center gap-2">
            <img src="/favicon.png" alt="certshack" className="h-7 w-7 object-contain rounded-lg bg-white" />
            certshack
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {navItems.filter(item => {
            if (item.key === 'admin' || item.key === 'diagrams' || item.key === 'metrics') return showAdmin
            if (item.key === 'feedback') return !!user
            return true
          }).map((item) => {
            const isActive = currentRoute === item.key || (item.key === 'skill-labs' && currentRoute?.startsWith('skill-lab:'))
            return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key, item.href)}
              className={cn(
                "w-full group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground")} />
              {item.label}
              {item.key === 'basket' && basketCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {basketCount}
                </span>
              )}
              {item.key === 'feedback' && feedbackCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {feedbackCount > 99 ? '99+' : feedbackCount}
                </span>
              )}
            </button>
          )})}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="md:hidden">
            <ThemeToggle />
          </div>
          {user ? (
            <>
              {(xp !== undefined || streak !== undefined) && (
                <div className="px-3 py-1 flex items-center gap-2 text-[11px] text-sidebar-foreground/60">
                  {level !== undefined && <span>⚡ Lv{level}</span>}
                  {xp !== undefined && <span>{xp} XP</span>}
                  {typeof streak === 'number' && streak > 0 && <span>🔥 {streak}d</span>}
                </div>
              )}
              <div className="px-3 py-1.5 text-xs text-sidebar-foreground/70 font-medium truncate" title={user.name}>
                {user.name}
              </div>
              <div className="px-3 pb-1 text-[11px] text-sidebar-foreground/50 truncate" title={user.email}>
                {user.email}
              </div>
              <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50" onClick={() => navigate('/login')}>
              <LogIn className="mr-2 h-4 w-4" />
              Log in
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}
