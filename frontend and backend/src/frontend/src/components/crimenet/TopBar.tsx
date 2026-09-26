import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getNotifications } from "@/lib/crimenet/services";
import type { NotificationItem } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Command, Languages, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { RiskBadge } from "./RiskBadge";
import { RoleSwitcher } from "./RoleSwitcher";

interface TopBarProps {
  onOpenCommandPalette: () => void;
  onOpenMobileNav: () => void;
}

export function TopBar({ onOpenCommandPalette, onOpenMobileNav }: TopBarProps) {
  const navigate = useNavigate();
  const { language, toggleLanguage } = useRole();
  const strings = getStrings(language);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getNotifications().then((items) => {
      if (!cancelled) setNotifications(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = notifications.filter((item) => !item.read).length;

  return (
    <header
      data-ocid="top_bar"
      className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 shadow-subtle sm:px-4"
    >
      <button
        type="button"
        data-ocid="top_bar.mobile_nav_button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-smooth hover:text-foreground lg:hidden"
      >
        <span className="flex flex-col gap-1" aria-hidden>
          <span className="block h-0.5 w-4 bg-current" />
          <span className="block h-0.5 w-4 bg-current" />
          <span className="block h-0.5 w-4 bg-current" />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <GlobalSearch />
      </div>

      <button
        type="button"
        data-ocid="top_bar.command_palette_button"
        onClick={onOpenCommandPalette}
        aria-label={strings.commandPalette}
        className="hidden h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-xs text-muted-foreground transition-smooth hover:text-foreground md:flex"
      >
        <Command className="size-3.5" aria-hidden />
        <kbd className="font-mono-id">⌘K</kbd>
      </button>

      <button
        type="button"
        data-ocid="top_bar.language_toggle"
        onClick={toggleLanguage}
        aria-label={`${strings.language}: ${language === "en" ? "English" : "हिन्दी"}`}
        className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs text-foreground transition-smooth hover:border-ring/50"
      >
        <Languages className="size-3.5 text-info" aria-hidden />
        <span className="font-medium uppercase">
          {language === "en" ? "EN" : "HI"}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-ocid="top_bar.notifications_button"
            aria-label={`${strings.notifications} (${unread} unread)`}
            className="relative flex size-9 items-center justify-center rounded-md border border-border bg-card/60 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <Bell className="size-4" aria-hidden />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-risk-critical px-1 font-mono-id text-[10px] font-semibold text-background">
                {unread}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>{strings.notifications}</span>
            <span className="font-mono-id text-[11px] font-normal text-muted-foreground">
              {unread} unread
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-80 overflow-auto">
            {notifications.map((item) => (
              <DropdownMenuItem
                key={item.id}
                data-ocid={`top_bar.notification.${item.id}`}
                className="flex flex-col items-start gap-1 py-2"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm",
                      item.read ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {item.title}
                  </span>
                  <RiskBadge risk={item.risk} showDot={false} />
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {item.detail}
                </span>
                <span className="font-mono-id text-[10px] text-muted-foreground">
                  {formatRelative(item.at)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <RoleSwitcher />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-ocid="top_bar.profile_button"
            aria-label={strings.profile}
            className="flex size-9 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <UserRound className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span>Insp. A. Deshmukh</span>
            <span className="font-mono-id text-[11px] font-normal text-muted-foreground">
              E-10021 · Central Cyber Cell
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-ocid="top_bar.profile_menu.security"
            onSelect={() => void navigate({ to: "/security" })}
          >
            Security &amp; Audit
          </DropdownMenuItem>
          <DropdownMenuItem data-ocid="top_bar.profile_menu.signout" disabled>
            <LogOut className="mr-2 size-3.5" aria-hidden />
            {strings.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
