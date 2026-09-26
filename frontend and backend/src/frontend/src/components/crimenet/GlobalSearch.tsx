import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { search } from "@/lib/crimenet/services";
import type { SearchResultGroup } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RiskBadge } from "./RiskBadge";

export function GlobalSearch() {
  const navigate = useNavigate();
  const { language } = useRole();
  const strings = getStrings(language);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    if (term.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void search(term).then((result) => {
      if (cancelled) return;
      setGroups(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  const select = (route: string) => {
    setOpen(false);
    setQuery("");
    void navigate({ to: route });
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          data-ocid="global_search.input"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={strings.searchPlaceholder}
          aria-label={strings.searchPlaceholder}
          className="h-9 w-full rounded-md border border-input bg-background/60 pl-9 pr-9 text-sm text-foreground outline-none transition-smooth placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        {query ? (
          <button
            type="button"
            data-ocid="global_search.clear_button"
            onClick={() => {
              setQuery("");
              setGroups([]);
            }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {open && query.trim().length >= 2 ? (
        <div
          data-ocid="global_search.results"
          className="absolute left-0 right-0 top-11 z-40 max-h-[60vh] overflow-auto rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
          {loading ? (
            <p
              data-ocid="global_search.loading_state"
              className="px-3 py-4 text-sm text-muted-foreground"
            >
              {strings.loading}…
            </p>
          ) : total === 0 ? (
            <p
              data-ocid="global_search.empty_state"
              className="px-3 py-4 text-sm text-muted-foreground"
            >
              {strings.noResults}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.kind} className="mb-1 last:mb-0">
                <p className="label-caps px-2 py-1.5 text-muted-foreground">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-ocid={`global_search.result.${item.id}`}
                        onClick={() => select(item.route)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-smooth hover:bg-muted/60",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {item.title}
                          </span>
                          <span className="block truncate font-mono-id text-[11px] text-muted-foreground">
                            {item.subtitle}
                          </span>
                        </span>
                        <RiskBadge risk={item.risk} showDot={false} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
