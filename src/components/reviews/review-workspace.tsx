"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  ClockIcon,
  ExternalIcon,
  ReviewIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  StatusBadge,
  statusLabel,
  type UiStatus,
} from "@/components/ui/status-badge";

type Job = {
  id: string;
  batchId?: string;
  batch_id?: string;
  status: UiStatus;
  outcome?: UiStatus;
  confidence?: number | string;
  latencyMs?: number;
  latency_ms?: number;
  rulesetVersion?: string;
  ruleset_version?: string;
  createdAt?: string;
  created_at?: string;
  completedAt?: string;
  completed_at?: string;
  errorMessage?: string;
  error_message?: string;
  reviewVersion?: number;
  review_version?: number;
};
type Application = {
  id?: string;
  externalId?: string;
  external_id?: string;
  regulatoryProfile?: string;
  regulatory_profile?: string;
  beverageProfile?: string;
  originType?: string;
  origin_type?: string;
  fields?: Record<string, unknown>;
  submittedFields?: Record<string, unknown>;
  submitted_fields?: Record<string, unknown>;
};
type Artifact = {
  id: string;
  signedUrl?: string;
  signed_url?: string;
  url?: string;
  panelType?: string;
  panel_type?: string;
  mimeType?: string;
  mime_type?: string;
  name?: string;
};
type Extraction = {
  fields?: Record<string, unknown>;
  observedFields?: Record<string, unknown>;
  observed_fields?: Record<string, unknown>;
  rawText?: string;
  raw_text?: string;
  imageQuality?: number | string;
  image_quality?: number | string;
  confidence?: number | string;
  source?: string;
  strategy?: string;
  model?: string;
  promptVersion?: string;
  prompt_version?: string;
  cached?: boolean;
  cacheHit?: boolean;
  cache_hit?: boolean;
  live?: boolean;
  provenance?: Record<string, unknown>;
  timing?: Record<string, unknown>;
  latencyMs?: number;
  latency_ms?: number;
};
type Finding = {
  id?: string;
  ruleId?: string;
  rule_id?: string;
  title?: string;
  label?: string;
  description?: string;
  status:
    "pass" | "fail" | "review" | "not_applicable" | "not_assessed" | string;
  severity?: string;
  expected?: unknown;
  expectedValue?: unknown;
  expected_value?: unknown;
  observed?: unknown;
  observedValue?: unknown;
  observed_value?: unknown;
  confidence?: number | string;
  explanation?: string;
  evidence?: unknown;
  citation?: { title?: string; url?: string; section?: string };
  sourceCitation?: { title?: string; url?: string; section?: string };
  source_citation?: { title?: string; url?: string; section?: string };
};
type History = {
  id?: string;
  status?: string;
  label?: string;
  createdAt?: string;
  created_at?: string;
  timestamp?: string;
};
type Decision = {
  id?: string;
  decision: string;
  notes?: string;
  createdAt?: string;
  created_at?: string;
};
type JobPayload = {
  job: Job;
  application: Application;
  artifacts: Artifact[];
  extraction?: Extraction | null;
  findings: Finding[];
  history?: History[];
  decisions?: Decision[];
};

const processingStatuses = [
  "draft",
  "queued",
  "validating",
  "extracting",
  "verifying",
  "processing",
];

export function ReviewWorkspace({ jobId }: { jobId: string }) {
  const [data, setData] = useState<JobPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [activePanel, setActivePanel] = useState(0);
  const [showPassed, setShowPassed] = useState(false);
  const [decision, setDecision] = useState("confirmed_clear");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: JobPayload;
          message?: string;
          error?: string;
        } & Partial<JobPayload>;
        if (!response.ok)
          throw new Error(
            payload.message ??
              payload.error ??
              "This review could not be loaded.",
          );
        setData(payload.data ?? (payload as JobPayload));
        setError("");
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(
            reason instanceof Error
              ? reason.message
              : "This review could not be loaded.",
          );
      } finally {
        setLoading(false);
      }
    },
    [jobId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const shouldPoll = Boolean(
    data && processingStatuses.includes(String(data.job.status)),
  );
  useEffect(() => {
    if (!shouldPoll) return;
    const startedAt = performance.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let requestController: AbortController | null = null;
    const nextDelay = () => {
      const elapsed = performance.now() - startedAt;
      if (elapsed < 6_000) return 200;
      if (elapsed < 15_000) return 500;
      return 1_400;
    };
    const poll = () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(poll, 3_000);
        return;
      }
      requestController = new AbortController();
      void load(requestController.signal).finally(() => {
        if (!stopped) timer = setTimeout(poll, nextDelay());
      });
    };
    timer = setTimeout(poll, 200);
    return () => {
      stopped = true;
      clearTimeout(timer);
      requestController?.abort();
    };
  }, [load, shouldPoll]);

  const submittedRaw =
    data?.application.fields ??
    data?.application.submittedFields ??
    data?.application.submitted_fields ??
    {};
  const submitted = flattenSubmitted(submittedRaw);
  const observed = flattenSubmitted(
    data?.extraction?.fields ??
      data?.extraction?.observedFields ??
      data?.extraction?.observed_fields ??
      {},
  );
  const currentStatus = data?.job.outcome ?? data?.job.status ?? "processing";
  const confidence = normalizeConfidence(
    data?.job.confidence ?? data?.extraction?.confidence,
  );
  const displayedFindings = useMemo(
    () =>
      (data?.findings ?? []).filter((finding) =>
        showPassed
          ? true
          : !["pass", "not_applicable"].includes(finding.status),
      ),
    [data, showPassed],
  );
  const counts = useMemo(
    () => ({
      pass: data?.findings.filter((f) => f.status === "pass").length ?? 0,
      fail: data?.findings.filter((f) => f.status === "fail").length ?? 0,
      review:
        data?.findings.filter((f) =>
          ["review", "not_assessed"].includes(f.status),
        ).length ?? 0,
    }),
    [data],
  );

  async function saveDecision() {
    if (
      ["accepted_with_override", "return_for_correction"].includes(decision) &&
      notes.trim().length < 10
    ) {
      setActionError("Add at least 10 characters explaining this decision.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes: notes.trim(),
          reviewVersion:
            data?.job.reviewVersion ?? data?.job.review_version ?? 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { job?: Job; decision?: Decision };
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ??
            payload.error ??
            "The decision could not be saved.",
        );
      setSaved(true);
      setNotes("");
      await load();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "The decision could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function retry() {
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ?? payload.error ?? "Retry could not be started.",
        );
      setSaved(false);
      await load();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Retry could not be started.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ReviewSkeleton />;
  if (error && !data)
    return (
      <div className="shell page-shell narrow-state">
        <InlineAlert title="Review unavailable" tone="danger">
          <p>{error}</p>
        </InlineAlert>
        <div className="state-actions">
          <button
            className="button button-primary"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Try again
          </button>
          <Link className="button button-secondary" href="/">
            Return to workspace
          </Link>
        </div>
      </div>
    );
  if (!data) return null;
  const processing = processingStatuses.includes(String(data.job.status));
  if (processing) return <ProcessingReview data={data} error={error} />;
  const activeArtifact = data.artifacts[activePanel];
  return (
    <div className="shell page-shell review-page">
      <div className="batch-breadcrumb">
        <Link href="/">Workspace</Link>
        <span>/</span>
        {(data.job.batchId ?? data.job.batch_id) ? (
          <>
            <Link href={`/batches/${data.job.batchId ?? data.job.batch_id}`}>
              Batch
            </Link>
            <span>/</span>
          </>
        ) : null}
        <span>
          {String(
            data.application.externalId ??
              data.application.external_id ??
              jobId.slice(0, 8),
          ).toUpperCase()}
        </span>
      </div>
      <div className="review-heading">
        <div>
          <div className="title-line">
            <h1>
              {text(
                submitted.brandName ?? submitted.brand_name,
                "Label application review",
              )}
            </h1>
            <StatusBadge status={currentStatus} />
          </div>
          <p>
            {text(
              submitted.classType ?? submitted.class_type,
              profileLabel(
                data.application.regulatoryProfile ??
                  data.application.regulatory_profile ??
                  data.application.beverageProfile,
              ),
            )}{" "}
            · Application{" "}
            {data.application.externalId ??
              data.application.external_id ??
              jobId.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="review-score">
          <span>Overall confidence</span>
          <strong>{confidence ? `${confidence}%` : "—"}</strong>
          <small>
            {confidence >= 90
              ? "High evidence confidence"
              : confidence >= 70
                ? "Review recommended"
                : "Limited evidence"}
          </small>
        </div>
      </div>
      {error ? (
        <InlineAlert title="Live refresh interrupted" tone="warning">
          Showing the most recently loaded result.
        </InlineAlert>
      ) : null}
      {saved ? (
        <InlineAlert title="Decision recorded" tone="success">
          The decision was added to this review’s history.
        </InlineAlert>
      ) : null}
      {actionError ? (
        <InlineAlert title="Decision not recorded" tone="danger">
          {actionError}
        </InlineAlert>
      ) : null}
      {["failed", "rejected"].includes(String(data.job.status)) ? (
        <InlineAlert title="Processing could not be completed" tone="danger">
          <p>
            {data.job.errorMessage ??
              data.job.error_message ??
              "A recoverable processing error occurred."}
          </p>
          <button
            className="button button-secondary button-small"
            disabled={saving}
            onClick={() => void retry()}
          >
            Retry processing
          </button>
        </InlineAlert>
      ) : null}
      <div className="review-grid">
        <section className="artwork-panel" aria-labelledby="artwork-heading">
          <div className="panel-heading">
            <div>
              <p className="kicker">Submitted evidence</p>
              <h2 id="artwork-heading">Label artwork</h2>
            </div>
            <span>
              {data.artifacts.length} panel
              {data.artifacts.length === 1 ? "" : "s"}
            </span>
          </div>
          {activeArtifact ? (
            <div className="artwork-stage">
              <div
                aria-label={`${panelLabel(activeArtifact)} label artwork`}
                className="artwork-image"
                role="img"
                style={{
                  backgroundImage: `url("${activeArtifact.signedUrl ?? activeArtifact.signed_url ?? activeArtifact.url ?? ""}")`,
                }}
              />
              <span>{panelLabel(activeArtifact)}</span>
            </div>
          ) : (
            <div className="missing-artwork">
              <WarningIcon size={28} />
              <strong>Artwork preview unavailable</strong>
              <p>Findings remain available from the completed extraction.</p>
            </div>
          )}
          {data.artifacts.length > 1 ? (
            <div className="panel-thumbnails" aria-label="Choose label panel">
              {data.artifacts.map((artifact, index) => (
                <button
                  aria-pressed={index === activePanel}
                  key={artifact.id}
                  onClick={() => setActivePanel(index)}
                  type="button"
                >
                  <span
                    style={{
                      backgroundImage: `url("${artifact.signedUrl ?? artifact.signed_url ?? artifact.url ?? ""}")`,
                    }}
                  />
                  <small>{panelLabel(artifact)}</small>
                </button>
              ))}
            </div>
          ) : null}
          <details className="ocr-details">
            <summary>View extracted text</summary>
            <pre>
              {data.extraction?.rawText ??
                data.extraction?.raw_text ??
                "No raw text was retained."}
            </pre>
          </details>
        </section>

        <section
          className="comparison-panel"
          aria-labelledby="comparison-heading"
        >
          <div className="panel-heading">
            <div>
              <p className="kicker">Application comparison</p>
              <h2 id="comparison-heading">Submitted vs. observed</h2>
            </div>
            <span>
              {confidence ? `${confidence}% confidence` : "Extracted evidence"}
            </span>
          </div>
          <ExtractionProvenance extraction={data.extraction} job={data.job} />
          <div
            className="comparison-table"
            role="table"
            aria-label="Field comparison"
          >
            <div className="comparison-row comparison-head" role="row">
              <span role="columnheader">Field</span>
              <span role="columnheader">Application</span>
              <span role="columnheader">Label</span>
            </div>
            {comparisonFields(submitted, observed).map((item) => (
              <div className="comparison-row" role="row" key={item.key}>
                <strong role="cell">{item.label}</strong>
                <span role="cell">{item.expected}</span>
                <span role="cell">{item.observed || <i>Not detected</i>}</span>
              </div>
            ))}
          </div>
          <div className="findings-heading">
            <div>
              <h2>Compliance findings</h2>
              <span>
                {counts.fail
                  ? `${counts.fail} issue${counts.fail > 1 ? "s" : ""}`
                  : counts.review
                    ? `${counts.review} for review`
                    : "No automated issues"}
              </span>
            </div>
            <label className="switch-label">
              <input
                checked={showPassed}
                onChange={(event) => setShowPassed(event.target.checked)}
                type="checkbox"
              />
              <span />
              Show passed checks
            </label>
          </div>
          <div className="finding-list">
            {displayedFindings.length ? (
              displayedFindings.map((finding, index) => (
                <FindingCard
                  finding={finding}
                  key={finding.id ?? finding.ruleId ?? finding.rule_id ?? index}
                />
              ))
            ) : (
              <div className="all-clear">
                <CheckIcon size={24} />
                <div>
                  <strong>All assessed checks passed</strong>
                  <p>
                    Turn on “Show passed checks” to inspect every rule and
                    citation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="decision-card" aria-labelledby="decision-heading">
        <div>
          <p className="kicker">Human decision</p>
          <h2 id="decision-heading">Record the review outcome</h2>
          <p>
            ProofCheck preserves the automated result. Your decision is added as
            a separate, auditable event.
          </p>
        </div>
        <div className="decision-form">
          <fieldset>
            <legend className="sr-only">Review decision</legend>
            {[
              [
                "confirmed_clear",
                "Confirm pre-check",
                "The evidence supports the automated result.",
              ],
              [
                "accepted_with_override",
                "Accept with override",
                "Document why a finding does not require correction.",
              ],
              [
                "return_for_correction",
                "Return for correction",
                "Record what the applicant needs to change.",
              ],
            ].map(([value, label, detail]) => (
              <label
                className={decision === value ? "selected" : ""}
                key={value}
              >
                <input
                  checked={decision === value}
                  name="decision"
                  onChange={() => {
                    setDecision(value);
                    setSaved(false);
                  }}
                  type="radio"
                  value={value}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>
              Review notes{" "}
              {decision !== "confirmed_clear" ? (
                <b>*</b>
              ) : (
                <small>(optional)</small>
              )}
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder={
                decision === "confirmed_clear"
                  ? "Add context for the audit trail"
                  : "Explain the rationale or required correction"
              }
            />
          </label>
          <button
            className="button button-primary"
            disabled={saving}
            onClick={() => void saveDecision()}
            type="button"
          >
            {saving ? "Saving decision…" : "Record decision"}
          </button>
        </div>
      </section>
      <section className="audit-card">
        <details>
          <summary>
            <span>
              <ClockIcon size={18} />
              Processing and decision history
            </span>
            <span>
              {(data.history?.length ?? 0) + (data.decisions?.length ?? 0)}{" "}
              events
            </span>
          </summary>
          <ol>
            {historyEvents(data).map((event, index) => (
              <li key={`${event.label}-${index}`}>
                <i />
                <div>
                  <strong>{event.label}</strong>
                  {event.note ? <p>{event.note}</p> : null}
                  <small>{formatDate(event.date)}</small>
                </div>
              </li>
            ))}
          </ol>
        </details>
        <div className="ruleset-line">
          Ruleset{" "}
          {data.job.rulesetVersion ??
            data.job.ruleset_version ??
            "2026-07-31.1"}{" "}
          · <Link href="/methodology">Assessment boundaries</Link>
        </div>
      </section>
    </div>
  );
}

function ExtractionProvenance({
  extraction,
  job,
}: {
  extraction?: Extraction | null;
  job: Job;
}) {
  const details = provenanceDetails(extraction, job);
  if (!details) return null;
  return (
    <aside aria-label="Extraction provenance" className="extraction-provenance">
      <div className="provenance-summary">
        <span className={`provenance-mode provenance-${details.mode}`}>
          {details.mode === "cached"
            ? "Cached"
            : details.mode === "live"
              ? "Live"
              : "Extracted"}
        </span>
        <div>
          <strong>{details.sourceLabel}</strong>
          <small>{details.strategyLabel}</small>
        </div>
      </div>
      <dl>
        {details.model ? (
          <div>
            <dt>Model / fixture</dt>
            <dd>{details.model}</dd>
          </div>
        ) : null}
        {details.extractionMs != null ? (
          <div>
            <dt>Extraction time</dt>
            <dd>{formatDuration(details.extractionMs)}</dd>
          </div>
        ) : null}
        {details.totalMs != null && details.totalMs !== details.extractionMs ? (
          <div>
            <dt>Total processing</dt>
            <dd>{formatDuration(details.totalMs)}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

function provenanceDetails(
  extraction: Extraction | null | undefined,
  job: Job,
) {
  if (!extraction) return null;
  const provenance = extraction.provenance ?? {};
  const timing = extraction.timing ?? {};
  const source = knownValue(extraction.source ?? provenance.source, [
    "openai",
    "cached_demo",
    "cached_extraction",
  ]);
  const cached =
    extraction.cached === true ||
    extraction.cacheHit === true ||
    extraction.cache_hit === true ||
    provenance.cached === true ||
    provenance.cacheHit === true;
  const live = extraction.live === true || provenance.live === true;
  const mode =
    source === "cached_demo" || source === "cached_extraction" || cached
      ? "cached"
      : source === "openai" || live
        ? "live"
        : "unknown";
  const strategy = knownValue(extraction.strategy ?? provenance.strategy, [
    "benchmark_replay",
    "cached_demo",
    "validated_fixture",
    "openai_vision",
    "vision",
    "multimodal",
    "native_text",
    "pdf_text",
    "ocr",
    "compact-fast.2026-07-31.1",
    "compact-fast.2026-07-31.2",
    "compact-fast.2026-07-31.3",
    "thorough.2026-07-31.1",
  ]);
  const strategyLabel =
    strategy && strategyLabels[strategy]
      ? strategyLabels[strategy]
      : mode === "cached"
        ? "Validated fixture replay"
        : mode === "live"
          ? "Vision field extraction"
          : "Structured field extraction";
  const extractionMs = safeDuration(
    extraction.latencyMs ??
      extraction.latency_ms ??
      timing.extractionMs ??
      timing.extraction_ms,
  );
  const totalMs = safeDuration(
    job.latencyMs ?? job.latency_ms ?? timing.totalMs ?? timing.total_ms,
  );
  const model = safeIdentifier(extraction.model);
  if (
    !source &&
    !cached &&
    !live &&
    !strategy &&
    !model &&
    extractionMs == null &&
    totalMs == null
  )
    return null;
  return {
    extractionMs,
    mode,
    model,
    sourceLabel:
      mode === "cached"
        ? source === "cached_extraction"
          ? "Cached prior live extraction"
          : "Validated demo extraction"
        : mode === "live"
          ? "Live OpenAI vision extraction"
          : "Structured label extraction",
    strategyLabel,
    totalMs,
  };
}

const strategyLabels: Record<string, string> = {
  benchmark_replay: "Benchmark fixture replay",
  cached_demo: "Validated fixture replay",
  validated_fixture: "Validated fixture replay",
  openai_vision: "Vision field extraction",
  vision: "Vision field extraction",
  multimodal: "Multimodal field extraction",
  native_text: "Native document text extraction",
  pdf_text: "PDF text and page extraction",
  ocr: "Optical character recognition",
  "compact-fast.2026-07-31.1": "Compact profile-aware vision extraction",
  "compact-fast.2026-07-31.2": "Compact profile-aware vision extraction",
  "compact-fast.2026-07-31.3": "Compact profile-aware vision extraction",
  "thorough.2026-07-31.1": "Thorough vision fallback",
};

function knownValue(value: unknown, allowed: string[]) {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : undefined;
}

function safeIdentifier(value: unknown) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value)
    ? value
    : undefined;
}

function safeDuration(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 86_400_000
    ? Math.round(number)
    : undefined;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1) return "< 1 ms";
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(1)} sec`;
  return `${Math.round(milliseconds / 1_000)} sec`;
}

function FindingCard({ finding }: { finding: Finding }) {
  const citation =
    finding.citation ?? finding.sourceCitation ?? finding.source_citation;
  const expected =
    finding.expected ?? finding.expectedValue ?? finding.expected_value;
  const observed =
    finding.observed ?? finding.observedValue ?? finding.observed_value;
  const tone =
    finding.status === "pass"
      ? "pass"
      : finding.status === "fail"
        ? "fail"
        : finding.status === "not_applicable"
          ? "neutral"
          : "review";
  const Icon = tone === "pass" ? CheckIcon : WarningIcon;
  return (
    <article className={`finding-card finding-${tone}`}>
      <Icon size={20} />
      <div>
        <div className="finding-title">
          <strong>
            {finding.title ??
              finding.label ??
              ruleLabel(finding.ruleId ?? finding.rule_id)}
          </strong>
          <span>
            {finding.status === "not_assessed"
              ? "Not assessed"
              : finding.status === "not_applicable"
                ? "Not applicable"
                : finding.status}
          </span>
        </div>
        <p>
          {finding.explanation ??
            finding.description ??
            defaultFindingCopy(finding.status)}
        </p>
        {expected !== undefined || observed !== undefined ? (
          <dl>
            <div>
              <dt>Expected</dt>
              <dd>{text(expected, "—")}</dd>
            </div>
            <div>
              <dt>Observed</dt>
              <dd>{text(observed, "Not detected")}</dd>
            </div>
          </dl>
        ) : null}
        {citation?.url ? (
          <a href={citation.url} target="_blank" rel="noreferrer">
            {citation.title ?? citation.section ?? "Official requirement"}
            <ExternalIcon size={14} />
          </a>
        ) : null}
      </div>
    </article>
  );
}
function ProcessingReview({
  data,
  error,
}: {
  data: JobPayload;
  error: string;
}) {
  const stages = ["queued", "validating", "extracting", "verifying"];
  const current = Math.max(0, stages.indexOf(String(data.job.status)));
  return (
    <div className="shell page-shell processing-page">
      <div className="batch-breadcrumb">
        <Link href="/">Workspace</Link>
        <span>/</span>
        <span>Processing label</span>
      </div>
      <div className="processing-card">
        <div className="processing-orbit">
          <ReviewIcon size={30} />
          <i />
        </div>
        <p className="kicker">Asynchronous verification</p>
        <h1>{statusLabel(data.job.status)}</h1>
        <p>
          This page updates automatically. You can leave or refresh without
          interrupting the worker.
        </p>
        {error ? (
          <InlineAlert title="Status refresh interrupted" tone="warning">
            Processing continues in the background. ProofCheck will retry.
          </InlineAlert>
        ) : null}
        <ol className="processing-stages">
          {stages.map((stage, index) => (
            <li
              className={
                index < current ? "done" : index === current ? "current" : ""
              }
              key={stage}
            >
              <span>
                {index < current ? <CheckIcon size={15} /> : index + 1}
              </span>
              <div>
                <strong>{statusLabel(stage)}</strong>
                <small>
                  {stage === "queued"
                    ? "Durable job accepted"
                    : stage === "validating"
                      ? "Checking artwork and application data"
                      : stage === "extracting"
                        ? "Reading fields and visual evidence"
                        : "Applying deterministic TTB rules"}
                </small>
              </div>
            </li>
          ))}
        </ol>
        <Link
          className="button button-secondary"
          href={
            (data.job.batchId ?? data.job.batch_id)
              ? `/batches/${data.job.batchId ?? data.job.batch_id}`
              : "/"
          }
        >
          Continue in workspace
        </Link>
      </div>
    </div>
  );
}
function comparisonFields(
  submitted: Record<string, unknown>,
  observed: Record<string, unknown>,
) {
  const fields = [
    ["brandName", "Brand name"],
    ["classType", "Class / type"],
    ["abv", "Alcohol content"],
    ["netContents", "Net contents"],
    ["producerName", "Responsible party"],
    ["producerAddress", "Address"],
    ["countryOfOrigin", "Country of origin"],
  ] as const;
  return fields
    .filter(
      ([key]) =>
        submitted[key] != null ||
        submitted[snake(key)] != null ||
        observed[key] != null ||
        observed[snake(key)] != null,
    )
    .map(([key, label]) => ({
      key,
      label,
      expected: text(submitted[key] ?? submitted[snake(key)], "—"),
      observed: text(observed[key] ?? observed[snake(key)], ""),
    }));
}
function flattenSubmitted(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const party =
    typeof fields.responsibleParty === "object" && fields.responsibleParty
      ? (fields.responsibleParty as Record<string, unknown>)
      : {};
  const contents =
    typeof fields.netContents === "object" && fields.netContents
      ? (fields.netContents as Record<string, unknown>)
      : undefined;
  const contentsText = contents
    ? `${text(contents.value, "")} ${String(contents.unit ?? "").replace("_", " ")}`.trim()
    : fields.netContents;
  const abv = fields.abv ?? fields.alcoholByVolume;
  return {
    ...fields,
    abv:
      typeof abv === "number" || (typeof abv === "string" && abv)
        ? `${abv}${String(abv).includes("%") ? "" : "%"}`
        : abv,
    netContents: contentsText,
    producerName: fields.producerName ?? party.name,
    producerAddress: fields.producerAddress ?? party.address,
  };
}
function snake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function text(value: unknown, fallback: string) {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "object" && "value" in value)
    return text((value as { value?: unknown }).value, fallback);
  return JSON.stringify(value);
}
function normalizeConfidence(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number <= 1 ? number * 100 : number);
}
function panelLabel(artifact: Artifact) {
  const value =
    artifact.panelType ?? artifact.panel_type ?? artifact.name ?? "Label panel";
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function profileLabel(value?: string) {
  return (
    (
      {
        faa_distilled_spirits: "Distilled spirits",
        faa_wine: "Wine",
        faa_malt_beverage: "Malt beverage",
        irc_wine_under_7: "Wine under 7% ABV",
        irc_beer_non_faa: "Beer outside FAA definition",
        classification_review: "Classification review",
      } as Record<string, string>
    )[value ?? ""] ?? "Alcohol beverage"
  );
}
function ruleLabel(value?: string) {
  if (!value) return "Compliance check";
  return value
    .replaceAll(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function defaultFindingCopy(status: string) {
  return status === "pass"
    ? "The submitted value and observed label evidence agree."
    : status === "fail"
      ? "Observed label evidence does not meet this requirement."
      : "Available artwork cannot establish this requirement with sufficient confidence.";
}
function decisionLabel(value: string) {
  return (
    (
      {
        confirmed_clear: "Human review confirmed",
        accepted_with_override: "Accepted with documented override",
        return_for_correction: "Returned for correction",
      } as Record<string, string>
    )[value] ?? value.replaceAll("_", " ")
  );
}
function historyEvents(
  data: JobPayload,
): { label: string; date?: string; note?: string }[] {
  return [
    ...(data.history ?? []).map((event) => ({
      label: event.label ?? statusLabel(event.status ?? "processing"),
      date: event.createdAt ?? event.created_at ?? event.timestamp,
    })),
    ...(data.decisions ?? []).map((event) => ({
      label: decisionLabel(event.decision),
      date: event.createdAt ?? event.created_at,
      note: event.notes,
    })),
  ];
}
function formatDate(value?: string) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
function ReviewSkeleton() {
  return (
    <div
      className="shell page-shell review-page"
      aria-busy="true"
      aria-label="Loading review"
    >
      <div className="skeleton skeleton-title" />
      <div className="review-grid">
        <div className="skeleton skeleton-artwork" />
        <div className="skeleton skeleton-table" />
      </div>
    </div>
  );
}
