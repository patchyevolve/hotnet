import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getToken, login } from "@/lib/crimenet/services";
import { useNavigate } from "@tanstack/react-router";
import { ShieldHalf } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

/**
 * Credential sign-in.
 *
 * The form exchanges a badge/email and password for a signed bearer token
 * (`POST /api/auth/login`) and hands the response straight to storage; the
 * role, station and name the rest of the UI shows are decoded back out of
 * that token, so nothing on this screen can choose an access level.
 */
export function SignInPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();

  const [emailOrBadge, setEmailOrBadge] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) {
      void navigate({ to: "/" });
    }
  }, [navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ emailOrBadge: emailOrBadge.trim(), password });
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
              <Label htmlFor="signin-credentials">{strings.emailOrBadge}</Label>
              <Input
                id="signin-credentials"
                data-ocid="signin.credential_input"
                type="text"
                value={emailOrBadge}
                onChange={(event) => setEmailOrBadge(event.target.value)}
                placeholder="j.rao@crimenet.local"
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signin-password">{strings.password}</Label>
              <Input
                id="signin-password"
                data-ocid="signin.password_input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
              />
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
                  busy || emailOrBadge.trim().length < 3 || password.length < 8
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
