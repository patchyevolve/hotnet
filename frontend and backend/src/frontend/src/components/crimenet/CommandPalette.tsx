import { navItems } from "@/lib/crimenet/navigation";
import { search } from "@/lib/crimenet/services";
import type { SearchResultGroup } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RiskBadge } from "./RiskBadge";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setGroups([]);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setGroups([]);
      return;
    }
    void search(query).then((result) => {
      if (!cancelled) setGroups(result);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const matchingNav = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return navItems;
    return navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term),
    );
  }, [query]);

  if (!open) return null;

  const go = (path: string) => {
    onOpenChange(false);
    void navigate({ to: path });
  };

  return (
    <div
      data-ocid="command_palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onOpenChange(false);
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="presentation"
      >
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <Command.Input
              data-ocid="command_palette.input"
              value={query}
              onValueChange={setQuery}
              placeholder="Jump to a section or search records..."
              className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono-id text-[10px] text-muted-foreground sm:block">
              ESC
            </kbd>
          </div>
          <Command.List className="scrollbar-thin max-h-[52vh] overflow-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching sections or records
            </Command.Empty>

            {matchingNav.length > 0 ? (
              <Command.Group
                heading="Sections"
                className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {matchingNav.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`nav-${item.id}`}
                    onSelect={() => go(item.path)}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted/60"
                  >
                    <item.icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {groups.map((group) => (
              <Command.Group
                key={group.kind}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${group.kind}-${item.id}`}
                    onSelect={() => go(item.route)}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      <span className="block truncate font-mono-id text-[11px] text-muted-foreground">
                        {item.subtitle}
                      </span>
                    </span>
                    <RiskBadge risk={item.risk} showDot={false} />
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export function CommandPaletteHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "hidden items-center gap-1 text-[11px] text-muted-foreground lg:flex",
        className,
      )}
    >
      <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono-id">
        ⌘K
      </kbd>
    </span>
  );
}
