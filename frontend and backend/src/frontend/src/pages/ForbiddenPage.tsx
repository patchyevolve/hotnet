import { EmptyState } from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

/**
 * 403 panel.
 *
 * Reached when a role opens a section the server would refuse as well
 * (`/security` redirects here before it mounts). Rendering a page instead of
 * a silent redirect keeps the refusal visible — the investigator sees *why*
 * nothing loaded rather than being bounced to the dashboard.
 */
export function ForbiddenPage({ body }: { body?: string }) {
  const { language } = useRole();
  const strings = getStrings(language);

  return (
    <div
      data-ocid="forbidden.page"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <EmptyState
        icon={<ShieldAlert className="size-5 text-risk-critical" aria-hidden />}
        title={strings.forbiddenTitle}
        body={body ?? strings.forbiddenBody}
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/" data-ocid="forbidden.home_link">
              {strings.backToDashboard}
            </Link>
          </Button>
        }
      />
    </div>
  );
}
