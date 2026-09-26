import { getStrings } from "@/lib/crimenet/i18n";
import { navItems } from "@/lib/crimenet/navigation";
import { useRole } from "@/lib/crimenet/role-context";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ShieldHalf } from "lucide-react";
import { StatusPill } from "./StatusPill";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { language } = useRole();
  const strings = getStrings(language);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <nav
      data-ocid="sidebar"
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-smooth",
        collapsed ? "w-[68px]" : "w-[248px]",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-info/40 bg-info/12 text-info">
          <ShieldHalf className="size-4" aria-hidden />
        </span>
        {!collapsed ? (
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-semibold tracking-tight text-sidebar-foreground">
              CrimeNet
            </span>
            <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              Intelligence Workstation
            </span>
          </span>
        ) : null}
      </div>

      <ul className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <li key={item.id}>
              <Link
                to={item.path}
                data-ocid={`sidebar.link.${item.id}`}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-smooth",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <item.icon
                  className={cn("size-4 shrink-0", active && "text-info")}
                  aria-hidden
                />
                {!collapsed ? (
                  <span className="min-w-0 flex-1 truncate">
                    {language === "hi" ? item.labelHi : item.label}
                  </span>
                ) : null}
                {!collapsed && active ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-info"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-sidebar-border p-2">
        {!collapsed ? (
          <div className="mb-2 rounded-md border border-border bg-card/50 px-2.5 py-2">
            <p className="label-caps text-muted-foreground">
              {strings.systemStatus}
            </p>
            <div className="mt-1.5">
              <StatusPill
                label={strings.systemStatusDetail}
                tone="success"
                pulse
              />
            </div>
          </div>
        ) : (
          <div
            className="mb-2 flex justify-center"
            title={strings.systemStatusDetail}
          >
            <span
              className="size-2 animate-pulse-dot rounded-full bg-risk-low"
              aria-hidden
            />
          </div>
        )}
        <button
          type="button"
          data-ocid="sidebar.toggle_button"
          onClick={onToggle}
          aria-label={
            collapsed ? strings.expandSidebar : strings.collapseSidebar
          }
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card/50 px-2 py-1.5 text-xs text-muted-foreground transition-smooth hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden />
          ) : (
            <>
              <ChevronLeft className="size-4" aria-hidden />
              <span>{strings.collapseSidebar}</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
