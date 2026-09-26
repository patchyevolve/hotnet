import { PageHeader } from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import {
  type FirView,
  type JobView,
  type StoredFile,
  createCase,
  createFir,
  getJob,
  listFirs,
  runCase,
  uploadEvidence,
} from "@/lib/crimenet/services";
import type { CaseRecord } from "@/lib/crimenet/types";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileUp, FolderPlus, Play } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const TERMINAL = new Set(["completed", "failed"]);

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Case intake: register an FIR, attach evidence, run the pipeline.
 *
 * The run is asynchronous — `POST /run` returns a job id immediately and the
 * page polls it, because the pipeline is a minutes-long subprocess and the
 * upload must not block on it.
 */
export function UploadPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();

  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [firs, setFirs] = useState<FirView[]>([]);
  const [uploaded, setUploaded] = useState<StoredFile[]>([]);

  const [firNumber, setFirNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeFir = firs.length > 0 ? firs[firs.length - 1] : null;

  // Poll the running job. Keyed on the job id so the interval is stable.
  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const timer = setInterval(() => {
      void getJob(job.jobId).then((next) => {
        setJob(next);
        if (TERMINAL.has(next.status)) {
          clearInterval(timer);
        }
      });
    }, 600);
    return () => clearInterval(timer);
  }, [job]);

  const refreshFirs = useCallback((caseId: string) => {
    void listFirs(caseId).then(setFirs);
  }, []);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await createCase({
        firNumber: firNumber.trim(),
        title: title.trim(),
        description: description.trim(),
      });
      setCaseRecord(created);
      refreshFirs(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFir() {
    if (!caseRecord) return;
    const next = window.prompt(strings.firNumber);
    if (!next?.trim()) return;
    setError(null);
    try {
      await createFir(caseRecord.id, { firNumber: next.trim() });
      refreshFirs(caseRecord.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleUpload() {
    if (!caseRecord || !activeFir || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const rows = await uploadEvidence(caseRecord.id, activeFir.firId, files);
      setUploaded((current) => [...current, ...rows]);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      refreshFirs(caseRecord.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleRun(append: boolean) {
    if (!caseRecord) return;
    setError(null);
    setBusy(true);
    try {
      const started = await runCase(caseRecord.id, { append });
      setJob(started);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const canRegister = firNumber.trim().length > 0 && title.trim().length >= 3;

  return (
    <div data-ocid="intake.page" className="flex flex-col gap-6">
      <PageHeader
        eyebrow={strings.caseRegistry}
        title={strings.caseIntake}
        description={strings.caseIntakeHint}
        actions={
          caseRecord ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-ocid="intake.add_fir_button"
              onClick={() => void handleAddFir()}
            >
              <FolderPlus className="size-4" aria-hidden />
              {strings.firNumber}
            </Button>
          ) : null
        }
      />

      {error ? (
        <p
          role="alert"
          data-ocid="intake.error"
          className="rounded-md border border-risk-critical/40 bg-risk-critical/12 px-3 py-2 text-sm text-risk-critical"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-display text-base tracking-tight">
              {strings.registerCase}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {caseRecord ? (
              <dl className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-caps text-muted-foreground">
                    {strings.status}
                  </dt>
                  <dd className="font-mono-id text-foreground">
                    {caseRecord.id}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-caps text-muted-foreground">
                    {strings.firNumber}
                  </dt>
                  <dd className="font-mono-id text-foreground">
                    {caseRecord.firNumber}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-caps text-muted-foreground">
                    {strings.evidence}
                  </dt>
                  <dd className="font-mono-id text-foreground">
                    {uploaded.length}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-caps text-muted-foreground">
                    {strings.firs}
                  </dt>
                  <dd className="font-mono-id text-foreground">
                    {firs.map((fir) => fir.firNumber).join(", ")}
                  </dd>
                </div>
              </dl>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => void handleRegister(event)}
              >
                <div className="space-y-2">
                  <Label htmlFor="intake-fir">{strings.firNumber}</Label>
                  <Input
                    id="intake-fir"
                    data-ocid="intake.fir_input"
                    value={firNumber}
                    onChange={(event) => setFirNumber(event.target.value)}
                    placeholder="DF/2026/4561"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {strings.firNumberHint}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-title">{strings.caseTitle}</Label>
                  <Input
                    id="intake-title"
                    data-ocid="intake.title_input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="UPI fraud ring"
                    minLength={3}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-desc">{strings.caseDescription}</Label>
                  <textarea
                    id="intake-desc"
                    data-ocid="intake.description_input"
                    className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  type="submit"
                  data-ocid="intake.register_button"
                  disabled={!canRegister || busy}
                >
                  <FolderPlus className="size-4" aria-hidden />
                  {busy ? strings.loading : strings.registerCase}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-display text-base tracking-tight">
              {strings.addEvidence}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!caseRecord ? (
              <p className="text-sm text-muted-foreground">
                {strings.caseIntakeHint}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    data-ocid="intake.file_input"
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:text-foreground"
                    onChange={(event) =>
                      setFiles(Array.from(event.target.files ?? []))
                    }
                  />
                </div>

                {files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {strings.noFilesSelected}
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {files.map((file) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1"
                      >
                        <span className="truncate text-foreground">
                          {file.name}
                        </span>
                        <span className="font-mono-id text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    data-ocid="intake.upload_button"
                    disabled={files.length === 0 || busy}
                    onClick={() => void handleUpload()}
                  >
                    <FileUp className="size-4" aria-hidden />
                    {busy ? strings.loading : strings.chooseFiles}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    data-ocid="intake.run_button"
                    disabled={
                      busy || (uploaded.length === 0 && files.length > 0)
                    }
                    onClick={() => void handleRun(uploaded.length > 0)}
                  >
                    <Play className="size-4" aria-hidden />
                    {uploaded.length > 0 ? strings.appendRun : strings.startRun}
                  </Button>
                </div>

                {uploaded.length > 0 ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {uploaded.slice(-6).map((row) => (
                      <li key={row.storedName} className="truncate">
                        {row.originalName}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {job ? (
        <Card className="border-border" data-ocid="intake.run_card">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center justify-between gap-3 font-display text-base tracking-tight">
              <span>{job.caseId}</span>
              <span className="label-caps text-muted-foreground">
                {job.status === "completed"
                  ? strings.runCompleted
                  : job.status === "failed"
                    ? strings.runFailed
                    : strings.runInProgress}
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {job.detail} · {job.fileCount} {strings.filesQueued}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={Math.round(job.progress * 100)} />
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono-id">
                {job.stage}/{job.totalStages}
              </span>
              {job.runId ? (
                <span className="font-mono-id">{job.runId}</span>
              ) : null}
              {job.error ? (
                <span className="text-risk-critical">{job.error}</span>
              ) : null}
            </div>
            {job.status === "completed" && caseRecord ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-ocid="intake.open_case_button"
                onClick={() => void navigate({ to: `/cases/${job.caseId}` })}
              >
                {strings.viewCase}
              </Button>
            ) : null}
            {job.status === "completed" && caseRecord ? (
              <p className="text-xs text-muted-foreground">
                <Link
                  to="/network"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {strings.network}
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
