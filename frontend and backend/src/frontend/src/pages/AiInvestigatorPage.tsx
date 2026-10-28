import { PageHeader, RiskBadge, StatusPill } from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import {
  getAiInsights,
  getAiMessages,
  getEntities,
  getEvidence,
} from "@/lib/crimenet/services";
import type {
  AiInsight,
  AiMessage,
  EntityRecord,
  EvidenceRecord,
} from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { useSearch } from "@tanstack/react-router";
import { BrainCircuit, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface RetrievalReply {
  text: string;
  citations: string[];
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function hits(haystack: string, tokens: string[]): number {
  const text = haystack.toLowerCase();
  return tokens.reduce(
    (sum, token) => (text.includes(token) ? sum + 1 : sum),
    0,
  );
}

/**
 * Retrieval-only assistant: assemble an answer from the records already
 * loaded on this page (indexed hypotheses, resolved entities, evidence). No
 * model call is made — the honest no-model reply is returned when nothing
 * matches.
 */
function retrieve(
  query: string,
  insights: AiInsight[],
  entities: EntityRecord[],
  evidence: EvidenceRecord[],
  templates: {
    insights: string;
    entities: string;
    evidence: string;
    noModel: string;
  },
): RetrievalReply {
  const q = query.toLowerCase();
  const tokens = tokenize(query);
  const wantsHypotheses = /hypothes|strongest|confidence|explain/.test(q);
  const wantsRisk = /high[- ]?\brisk|risk|critical/.test(q);
  const wantsEvidence = /evidence|file|document|proof/.test(q);

  const lines: string[] = [];
  const citations: string[] = [];

  const rankedInsights = wantsHypotheses
    ? [...insights].sort((a, b) => b.confidence - a.confidence).slice(0, 3)
    : insights
        .map((insight) => ({
          insight,
          score: hits(
            `${insight.title} ${insight.detail} ${(insight.basis ?? []).join(" ")}`,
            tokens,
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((entry) => entry.insight);

  if (rankedInsights.length > 0) {
    lines.push(templates.insights);
    for (const insight of rankedInsights) {
      lines.push(
        `· ${insight.id} — ${insight.title} (${Math.round(insight.confidence * 100)}%)`,
      );
      citations.push(insight.id);
    }
  }

  const rankedEntities = wantsRisk
    ? entities
        .filter(
          (entity) => entity.risk === "critical" || entity.risk === "high",
        )
        .slice(0, 4)
    : entities
        .map((entity) => ({
          entity,
          score: hits(`${entity.id} ${entity.name} ${entity.kind}`, tokens),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((entry) => entry.entity);

  if (rankedEntities.length > 0) {
    lines.push(templates.entities);
    for (const entity of rankedEntities) {
      lines.push(`· ${entity.id} — ${entity.name} (${entity.kind})`);
      citations.push(entity.id);
    }
  }

  const rankedEvidence = wantsEvidence
    ? evidence.slice(0, 4)
    : evidence
        .map((record) => ({
          record,
          score: hits(`${record.id} ${record.label} ${record.kind}`, tokens),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((entry) => entry.record);

  if (rankedEvidence.length > 0) {
    lines.push(templates.evidence);
    for (const record of rankedEvidence) {
      lines.push(`· ${record.id} — ${record.label}`);
      citations.push(record.id);
    }
  }

  if (lines.length === 0) return { text: templates.noModel, citations: [] };
  return { text: lines.join("\n"), citations };
}

export function AiInvestigatorPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const search = useSearch({ from: "/ai-investigator" });
  const focusInsightId = search.insight;
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getAiMessages(),
      getAiInsights(),
      getEntities(),
      getEvidence(),
    ]).then(([messageResult, insightResult, entityResult, evidenceResult]) => {
      if (cancelled) return;
      setMessages(messageResult);
      setInsights(insightResult);
      setEntities(entityResult);
      setEvidence(evidenceResult);
      setLoading(false);
    });
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

  // Deep link from the intelligence feed: `?insight=HYP_…` scrolls the
  // matching hypothesis into view and rings it.
  useEffect(() => {
    if (!focusInsightId || loading) return;
    const node = document.querySelector(
      `[data-selected-insight="${focusInsightId}"]`,
    );
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusInsightId, loading]);

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

    const reply = retrieve(trimmed, insights, entities, evidence, {
      insights: strings.replyInsights,
      entities: strings.replyEntities,
      evidence: strings.replyEvidence,
      noModel: strings.noModelAnswer,
    });
    const aiMessage: AiMessage = {
      id: `MSG-${Date.now() + 1}`,
      author: "ai",
      text: reply.text,
      at: new Date().toISOString(),
      citations: reply.citations,
    };
    setMessages((current) => [...current, aiMessage]);
  };

  const suggestedPrompts = [
    strings.askPromptHypotheses,
    strings.askPromptHighRisk,
    strings.askPromptEvidence,
  ];

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
              messages.map((message, index) => (
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

                  <p className="text-sm whitespace-pre-line text-foreground">
                    {message.text}
                  </p>

                  {message.citations && message.citations.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.citations.map((citation) => (
                        <span
                          key={citation}
                          className="rounded border border-border bg-card px-1.5 py-0.5 font-mono-id text-[10px] text-info"
                        >
                          {citation}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {typeof message.confidence === "number" ? (
                    <p className="mt-2 font-mono-id text-[10px] text-muted-foreground">
                      {Math.round(message.confidence * 100)}%{" "}
                      {strings.confidence}
                    </p>
                  ) : null}
                </div>
              ))
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
            {insights.map((insight, index) => {
              const selected =
                Boolean(focusInsightId) && focusInsightId === insight.id;
              const hasProvenance = Boolean(
                insight.basis?.length ||
                  insight.generation ||
                  insight.runId ||
                  insight.alternatives?.length,
              );
              return (
                <article
                  key={insight.id}
                  data-ocid={`ai_investigator.insight.${index + 1}`}
                  data-selected-insight={selected ? insight.id : undefined}
                  className={cn(
                    "rounded-lg border p-3",
                    selected
                      ? "border-info/60 bg-info/8 ring-2 ring-info/30"
                      : "border-border bg-card/60",
                  )}
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
                      {Math.round(insight.confidence * 100)}%{" "}
                      {strings.confidence}
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

                  {hasProvenance ? (
                    <div className="mt-2 border-t border-border/60 pt-2">
                      <p className="label-caps text-muted-foreground">
                        {strings.howDerived}
                      </p>
                      {insight.generation ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {`${strings.generationLabel}: ${insight.generation}`}
                        </p>
                      ) : null}
                      {insight.runId ? (
                        <p className="font-mono-id text-[10px] text-muted-foreground">
                          {`${strings.runLabel}: ${insight.runId}`}
                        </p>
                      ) : null}
                      {insight.basis && insight.basis.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {insight.basis.map((item) => (
                            <li
                              key={item}
                              className="text-[11px] text-muted-foreground"
                            >
                              {`· ${item}`}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {typeof insight.supportingCount === "number" ? (
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono-id text-[10px] text-muted-foreground">
                            {`${insight.supportingCount} ${strings.supportingLabel}`}
                          </span>
                        ) : null}
                        {typeof insight.contradictingCount === "number" ? (
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono-id text-[10px] text-muted-foreground">
                            {`${insight.contradictingCount} ${strings.contradictingLabel}`}
                          </span>
                        ) : null}
                        {insight.alternatives &&
                        insight.alternatives.length > 0 ? (
                          <span
                            title={insight.alternatives.join(" · ")}
                            className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono-id text-[10px] text-muted-foreground"
                          >
                            {`${insight.alternatives.length} ${strings.alternativesLabel}`}
                          </span>
                        ) : null}
                      </div>
                      {insight.nullHypothesis ? (
                        <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                          {`${strings.nullHypothesisLabel}: ${insight.nullHypothesis}`}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
