import { EmptyState } from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

export function NotFoundPage() {
  return (
    <div
      data-ocid="not_found.page"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <EmptyState
        icon={<Compass className="size-5" aria-hidden />}
        title="Section not found"
        body="The requested section does not exist in CrimeNet. Return to the Command Center to continue."
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/" data-ocid="not_found.home_link">
              Back to Command Center
            </Link>
          </Button>
        }
      />
    </div>
  );
}
