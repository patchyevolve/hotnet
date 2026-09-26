import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStrings } from "@/lib/crimenet/i18n";
import {
  roleDescriptions,
  roleLabels,
  roles,
  useRole,
} from "@/lib/crimenet/role-context";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, UserCog } from "lucide-react";

export function RoleSwitcher() {
  const { role, setRole, language } = useRole();
  const strings = getStrings(language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-ocid="role_switcher.trigger"
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-xs text-foreground transition-smooth hover:border-ring/50"
        >
          <UserCog className="size-3.5 text-info" aria-hidden />
          <span className="hidden flex-col items-start leading-tight sm:flex">
            <span className="label-caps text-muted-foreground">
              {strings.demoRole}
            </span>
            <span className="font-medium">{roleLabels[role]}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>{strings.demoRole}</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {strings.demoRoleNote}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((item) => (
          <DropdownMenuItem
            key={item}
            data-ocid={`role_switcher.option.${item.toLowerCase()}`}
            onSelect={() => setRole(item)}
            className="flex items-start gap-2"
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {role === item ? (
                <Check className="size-3.5 text-info" aria-hidden />
              ) : null}
            </span>
            <span className="min-w-0">
              <span
                className={cn("block text-sm", role === item && "text-info")}
              >
                {roleLabels[item]}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {roleDescriptions[item]}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
