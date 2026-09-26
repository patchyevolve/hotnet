import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { EntityDrawer } from "./EntityDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerEntityId, setDrawerEntityId] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    function handleOpenDrawer(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) setDrawerEntityId(detail);
    }
    window.addEventListener("crimenet:open-entity", handleOpenDrawer);
    return () =>
      window.removeEventListener("crimenet:open-entity", handleOpenDrawer);
  }, []);

  const closeDrawer = useCallback(() => setDrawerEntityId(null), []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden lg:flex">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />
      </div>

      {mobileNavOpen ? (
        <div
          data-ocid="app_shell.mobile_nav"
          className="fixed inset-0 z-50 flex bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMobileNavOpen(false);
          }}
          role="presentation"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="presentation"
          >
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileNavOpen(false)}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
          <button
            type="button"
            data-ocid="app_shell.mobile_nav_close_button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="m-3 flex size-9 items-center justify-center self-start rounded-md border border-border bg-card text-muted-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main
          data-ocid="app_shell.main"
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-background"
        >
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
            {children}
          </div>
          <footer className="mx-auto w-full max-w-[1600px] px-4 pb-6 pt-2 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                CrimeNet Intelligence Workstation · All records are fictional
                demonstration data.
              </span>
              <a
                href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
                target="_blank"
                rel="noreferrer"
                className="transition-smooth hover:text-foreground"
              >
                © {new Date().getFullYear()}. Built with love using caffeine.ai
              </a>
            </div>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <EntityDrawer entityId={drawerEntityId} onClose={closeDrawer} />
    </div>
  );
}

/** Open the shared entity quick-view drawer from anywhere in the app. */
export function openEntityDrawer(entityId: string) {
  window.dispatchEvent(
    new CustomEvent<string>("crimenet:open-entity", { detail: entityId }),
  );
}
