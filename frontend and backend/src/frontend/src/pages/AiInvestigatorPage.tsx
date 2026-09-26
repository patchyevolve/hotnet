import { PageHeader, RiskBadge, StatusPill } from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getAiInsights, getAiMessages } from "@/lib/crimenet/services";
import type { AiInsight, AiMessage } from "@/lib/crimenet/types";
import { useNavigate } from "@tanstack/react-router";
import { BrainCircuit, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AiAction {
  label: string;
  route: string;
}

interface AiStructuredReply {
  finding: string;
  evidence: string[];
  actions: AiAction[];
}

const suggestedPrompts = [
  "Show connections between Case CR-2026-01482 and E-10482",
  "Find common phone numbers across these cases",
  "Trace transactions linked to E-10482",
  "Which entities connect these cases?",
];

const structuredReplies: Record<string, AiStructuredReply> = {
  "Show connections between Case CR-2026-01482 and E-10482": {
    finding:
      "E-10482 is connected to 4 cases through 3 phone numbers and 2 financial accounts.",
    evidence: ["CR-2026-01482", "Phone +91 XXXXXXX421", "Account XX4582"],
    actions: [
      { label: "View on Network", route: "/network" },
      { label: "View Money Trail", route: "/money-trail" },
      { label: "View Case", route: "/cases/CR-2026-01482" },
    ],
  },
  "Find common phone numbers across these cases": {
    finding:
      "3 phone numbers recur across CR-2026-01482 and CR-2026-01390, indicating a shared coordination layer.",
    evidence: [
      "+91 XXXXXXX421 (Burner-01)",
      "+91 XXXXXXX210 (F. Qureshi)",
      "+91 XXXXXXX031 (S. Kulkarni)",
    ],
    actions: [
      { label: "View on Network", route: "/network" },
      { label: "View Case", route: "/cases/CR-2026-01482" },
    ],
  },
  "Trace transactions linked to E-10482": {
    finding:
      "₹2.84 Cr traced from victim accounts through UPI, shell accounts and a crypto off-ramp wallet linked to E-10482.",
    evidence: ["TX-5003", "TX-5005", "Account XX4582", "Wallet 0x7f••a91"],
    actions: [
      { label: "View Money Trail", route: "/money-trail" },
      { label: "View on Network", route: "/network" },
      { label: "View Case", route: "/cases/CR-2026-01482" },
    ],
  },
  "Which entities connect these cases?": {
    finding:
      "E-10484 (Meridian Trade Links) and E-10482 are the shared entities bridging CR-2026-01482 and CR-2026-01390.",
    evidence: ["E-10484", "E-10482", "CR-2026-01390", "CR-2026-01482"],
    actions: [
      { label: "View on Network", route: "/network" },
      { label: "View Case", route: "/cases/CR-2026-01482" },
    ],
  },
};

const fallbackReply: AiStructuredReply = {
  finding:
    "E-10482 is connected to 4 cases through 3 phone numbers and 2 financial accounts.",
  evidence: ["CR-2026-01482", "Phone +91 XXXXXXX421", "Account XX4582"],
  actions: [
    { label: "View on Network", route: "/network" },
    { label: "View Money Trail", route: "/money-trail" },
    { label: "View Case", route: "/cases/CR-2026-01482" },
  ],
};

export function AiInvestigatorPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAiMessages(), getAiInsights()]).then(
      ([messageResult, insightResult]) => {
        if (cancelled) return;
        setMessages(messageResult);
        setInsights(insightResult);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    void messages.length;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const analystMessage: AiMessage = {
      id: `MSG-${Date.now()}`,
      author: "analyst",
      text: trimmed,
      at: now,
    };
    setMessages((current) => [...current, analystMessage]);
    setDraft("");

    const reply = structuredReplies[trimmed] ?? fallbackReply;
    const aiMessage: AiMessage = {
      id: `MSG-${Date.now() + 1}`,
      author: "ai",
      text: reply.finding,
      at: new Date().toISOString(),
      citations: reply.evidence,
      confidence: 0.86,
    };
    setMessages((current) => [...current, aiMessage]);
  };

  return (
    <div data-ocid="ai_investigator.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.analystAssistant}
        title={strings.aiInvestigator}
        description={strings.aiDescription}
        actions={<StatusPill label={strings.demoModeNoModel} tone="warning" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel flex h-[620px] flex-col overflow-hidden">
          <div className="panel-header">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <BrainCircuit className="size-4 text-info" aria-hidden />
              {strings.askAnalyst}
            </h2>
          </div>

          <div
            ref={scrollRef}
            className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          >
            {loading ? (
              <p
                data-ocid="ai_investigator.loading_state"
                className="text-sm text-muted-foreground"
              >
                {strings.loading}…
              </p>
            ) : (
              messages.map((message, index) => {
                const reply =
                  message.author === "ai"
                    ? (structuredReplies[message.text] ?? {
                        finding: message.text,
                        evidence: message.citations ?? [],
                        actions: fallbackReply.actions,
                      })
                    : null;
                return (
                  <div
                    key={message.id}
                    data-ocid={`ai_investigator.message.${index + 1}`}
                    className={
                      message.author === "analyst"
                        ? "ml-auto max-w-[85%] rounded-lg border border-info/30 bg-info/10 p-3"
                        : "mr-auto max-w-[90%] rounded-lg border border-border bg-muted/30 p-3"
                    }
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="label-caps text-muted-foreground">
                        {message.author === "analyst"
                          ? strings.analyst
                          : strings.aiInvestigatorName}
                      </span>
                      <time className="font-mono-id text-[10px] text-muted-foreground">
                        {formatDateTime(message.at)}
                      </time>
                    </div>

                    {reply ? (
                      <div className="flex flex-col gap-2.5">
                        <div>
                          <p className="label-caps text-info">
                            {strings.finding}
                          </p>
                          <p className="mt-0.5 text-sm text-foreground">
                            {reply.finding}
                          </p>
                        </div>
                        <div>
                          <p className="label-caps text-muted-foreground">
                            {strings.evidenceLabel}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {reply.evidence.map((item) => (
                              <span
                                key={item}
                                className="rounded border border-border bg-card px-1.5 py-0.5 font-mono-id text-[10px] text-info"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="label-caps text-muted-foreground">
                            {strings.actions}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {reply.actions.map((action) => (
                              <button
                                key={action.label}
                                type="button"
                                data-ocid={`ai_investigator.action.${action.label}`}
                                onClick={() =>
                                  void navigate({ to: action.route })
                                }
                                className="rounded-md border border-info/40 bg-info/12 px-2.5 py-1 text-[11px] font-medium text-info transition-smooth hover:bg-info/20"
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground">{message.text}</p>
                    )}

                    {typeof message.confidence === "number" ? (
                      <p className="mt-2 font-mono-id text-[10px] text-muted-foreground">
                        {Math.round(message.confidence * 100)}%{" "}
                        {strings.confidence}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={prompt}
                  type="button"
                  data-ocid={`ai_investigator.suggested_prompt.${index + 1}`}
                  onClick={() => send(prompt)}
                  className="rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-smooth hover:border-info/40 hover:text-info"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              <textarea
                data-ocid="ai_investigator.input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send(draft);
                  }
                }}
                rows={2}
                placeholder={strings.askPlaceholder}
                aria-label={strings.askPlaceholder}
                className="scrollbar-thin min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-smooth placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <Button
                type="submit"
                data-ocid="ai_investigator.send_button"
                disabled={draft.trim().length === 0}
                className="gap-1.5"
              >
                <Send className="size-3.5" aria-hidden />
                {strings.send}
              </Button>
            </form>
          </div>
        </div>

        <div className="panel flex h-[620px] flex-col overflow-hidden">
          <div className="panel-header">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-neutral-purple" aria-hidden />
              {strings.insights}
            </h2>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {insights.map((insight, index) => (
              <article
                key={insight.id}
                data-ocid={`ai_investigator.insight.${index + 1}`}
                className="rounded-lg border border-border bg-card/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    {insight.title}
                  </h3>
                  <RiskBadge risk={insight.risk} showDot={false} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {insight.detail}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono-id text-[10px] text-muted-foreground">
                    {Math.round(insight.confidence * 100)}% {strings.confidence}
                  </span>
                  {insight.citations.map((citation) => (
                    <span
                      key={citation}
                      className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono-id text-[10px] text-info"
                    >
                      {citation}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
