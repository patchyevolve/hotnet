import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStrings } from "@/lib/crimenet/i18n";
import {
  roleDescriptions,
  roleLabels,
  useRole,
} from "@/lib/crimenet/role-context";
import { getMeta, getToken, startSession } from "@/lib/crimenet/services";
import type { Role, SessionIdentity } from "@/lib/crimenet/types";
import { useNavigate } from "@tanstack/react-router";
import { ShieldHalf } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

interface Meta {
  roles: Role[];
  jurisdictions: string[];
}

/**
 * Identity picker.
 *
 * This is deliberately not a credential check — it issues a signed session
 * token so uploads and runs carry a stable user id and jurisdiction. Swapping
 * in `CredentialIdentityProvider` on the server changes nothing here: same
 * payload, same response, same stored token.
 */
export function SignInPage() {
  const { language, setRole } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();

  const [meta, setMeta] = useState<Meta>({ roles: [], jurisdictions: [] });
  const [displayName, setDisplayName] = useState("");
  const [role, setRoleValue] = useState<Role>("INSPECTOR");
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) {
      void navigate({ to: "/" });
      return;
    }
    void getMeta().then((result) => {
      setMeta(result);
      setJurisdictionId((current) => current || result.jurisdictions[0] || "");
    });
  }, [navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await startSession({
        displayName: displayName.trim(),
        role,
        jurisdictionId,
      });
      const identity: SessionIdentity = session.identity;
      setRole(identity.role);
      await navigate({ to: "/" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-xl border-border">
        <CardHeader className="space-y-3">
          <span className="flex size-10 items-center justify-center rounded-md border border-info/40 bg-info/12 text-info">
            <ShieldHalf className="size-5" aria-hidden />
          </span>
          <CardTitle className="font-display text-xl tracking-tight">
            {strings.signInTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {strings.signInSubtitle}
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="space-y-2">
              <Label htmlFor="signin-name">{strings.displayName}</Label>
              <Input
                id="signin-name"
                data-ocid="signin.display_name_input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Insp. Rao"
                minLength={2}
                maxLength={80}
                required
                autoFocus
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="label-caps text-muted-foreground">
                {strings.role}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {meta.roles.map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-sm transition-smooth ${
                      role === value
                        ? "border-info/60 bg-info/8 text-foreground"
                        : "border-border bg-card/60 text-muted-foreground hover:border-border hover:bg-card"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      className="sr-only"
                      value={value}
                      checked={role === value}
                      onChange={() => setRoleValue(value)}
                      data-ocid={`signin.role_${value.toLowerCase()}`}
                    />
                    <span className="font-medium">{roleLabels[value]}</span>
                    <span className="text-xs">{roleDescriptions[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="signin-jurisdiction">
                {strings.jurisdiction}
              </Label>
              <select
                id="signin-jurisdiction"
                data-ocid="signin.jurisdiction_select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={jurisdictionId}
                onChange={(event) => setJurisdictionId(event.target.value)}
              >
                {meta.jurisdictions.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("JURISDICTION_", "").replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <p
                role="alert"
                data-ocid="signin.error"
                className="rounded-md border border-risk-critical/40 bg-risk-critical/12 px-3 py-2 text-sm text-risk-critical"
              >
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {strings.sessionNotice}
              </p>
              <Button
                type="submit"
                data-ocid="signin.submit_button"
                disabled={
                  busy || displayName.trim().length < 2 || !jurisdictionId
                }
              >
                {busy ? strings.loading : strings.signInCta}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
