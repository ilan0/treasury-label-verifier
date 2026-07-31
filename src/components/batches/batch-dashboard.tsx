"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowIcon,
  CheckIcon,
  ClockIcon,
  MoreIcon,
  SearchIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  StatusBadge,
  statusLabel,
  type UiStatus,
} from "@/components/ui/status-badge";

type Batch = {
  id: string;
  name?: string;
  status?: string;
  totalCount?: number;
  total_count?: number;
  createdAt?: string;
  created_at?: string;
  expiresAt?: string;
  expires_at?: string;
  mode?: string;
};
type Job = {
  id: string;
  externalId?: string;
  external_id?: string;
  brandName?: string;
  brand_name?: string;
  classType?: string;
  class_type?: string;
  profile?: string;
  status: UiStatus;
  outcome?: UiStatus;
  confidence?: number | string | null;
  completedAt?: string;
  completed_at?: string;
  errorCode?: string;
  error_code?: string;
};
type Aggregates = {
  total?: number;
  queued?: number;
  processing?: number;
  completed?: number;
  precheckPassed?: number;
  precheck_passed?: number;
  reviewRequired?: number;
  review_required?: number;
  correctionNeeded?: number;
  correction_needed?: number;
  failed?: number;
  cancelled?: number;
};
type BatchPayload = {
  batch: Batch;
  jobs: Job[];
  aggregates?: Aggregates;
  pagination?: { total?: number; nextCursor?: string | null };
};

const terminal = new Set([
  "completed",
  "precheck_passed",
  "review_required",
  "human_review_required",
  "correction_needed",
  "failed",
  "rejected",
  "cancelled",
  "expired",
]);
function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

export function BatchDashboard({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [data, setData] = useState<BatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("application");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/batches/${batchId}?limit=300`, {
          signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: BatchPayload;
          message?: string;
          error?: string;
        } & Partial<BatchPayload>;
        if (!response.ok)
          throw new Error(
            payload.message ??
              payload.error ??
              "This batch could not be loaded.",
          );
        setData(payload.data ?? (payload as BatchPayload));
        setError("");
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(
            reason instanceof Error
              ? reason.message
              : "This batch could not be loaded.",
          );
      } finally {
        setLoading(false);
      }
    },
    [batchId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    if (
      !data ||
      data.jobs.every((job) => terminal.has(String(job.outcome ?? job.status)))
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      if (document.visibilityState === "visible")
        void load().finally(() => {
          timer = setTimeout(poll, 1600);
        });
      else timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1200);
    return () => clearTimeout(timer);
  }, [data, load]);

  const summary = useMemo(() => {
    const aggregate = data?.aggregates ?? {};
    const jobs = data?.jobs ?? [];
    const count = (names: string[]) =>
      jobs.filter((job) => names.includes(String(job.outcome ?? job.status)))
        .length;
    const total = number(
      aggregate.total ??
        data?.batch.totalCount ??
        data?.batch.total_count ??
        jobs.length,
    );
    const passed =
      number(aggregate.precheckPassed ?? aggregate.precheck_passed) ||
      count(["precheck_passed", "completed"]);
    const review =
      number(aggregate.reviewRequired ?? aggregate.review_required) ||
      count(["human_review_required", "review_required"]);
    const correction =
      number(aggregate.correctionNeeded ?? aggregate.correction_needed) ||
      count(["correction_needed"]);
    const failed = number(aggregate.failed) || count(["failed", "rejected"]);
    const completed =
      number(aggregate.completed) ||
      passed + review + correction + failed + count(["cancelled"]);
    return {
      total,
      passed,
      review,
      correction,
      failed,
      completed,
      processing: Math.max(0, total - completed),
    };
  }, [data]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    let jobs = (data?.jobs ?? []).filter((job) => {
      const current = String(job.outcome ?? job.status);
      const matchesFilter =
        filter === "all" ||
        (filter === "processing"
          ? !terminal.has(current)
          : filter === "passed"
            ? ["completed", "precheck_passed"].includes(current)
            : filter === "review"
              ? ["review_required", "human_review_required"].includes(current)
              : filter === current);
      return (
        matchesFilter &&
        (!query ||
          [
            job.externalId,
            job.external_id,
            job.brandName,
            job.brand_name,
            job.classType,
            job.class_type,
          ].some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(query),
          ))
      );
    });
    jobs = [...jobs].sort((a, b) =>
      sort === "confidence"
        ? number(b.confidence) - number(a.confidence)
        : sort === "status"
          ? String(a.outcome ?? a.status).localeCompare(
              String(b.outcome ?? b.status),
            )
          : String(
              a.externalId ?? a.external_id ?? a.brandName ?? a.brand_name,
            ).localeCompare(
              String(
                b.externalId ?? b.external_id ?? b.brandName ?? b.brand_name,
              ),
            ),
    );
    return jobs;
  }, [data, filter, search, sort]);
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const pagedJobs = shown.slice((page - 1) * pageSize, page * pageSize);

  async function batchAction(action: "cancel" | "delete") {
    setActing(true);
    setActionError("");
    try {
      const response = await fetch(
        `/api/batches/${batchId}${action === "cancel" ? "/cancel" : ""}`,
        {
          method: action === "cancel" ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body:
            action === "cancel" ? JSON.stringify({ confirm: true }) : undefined,
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ??
            payload.error ??
            `The batch could not be ${action === "cancel" ? "cancelled" : "deleted"}.`,
        );
      if (action === "delete") router.push("/");
      else {
        setConfirm(null);
        await load();
      }
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "The action could not be completed.",
      );
    } finally {
      setActing(false);
    }
  }

  async function retryFailed() {
    setActing(true);
    setActionError("");
    try {
      const response = await fetch(`/api/batches/${batchId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { retried?: number };
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ??
            payload.error ??
            "Failed jobs could not be retried.",
        );
      await load();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Failed jobs could not be retried.",
      );
    } finally {
      setActing(false);
    }
  }

  function exportCsv() {
    if (!data) return;
    const cells = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["application_id", "brand_name", "status", "confidence"],
      ...data.jobs.map((job) => [
        job.externalId ?? job.external_id ?? job.id,
        job.brandName ?? job.brand_name ?? "",
        statusLabel(job.outcome ?? job.status),
        job.confidence ?? "",
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map(cells).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.batch.name ?? "proofcheck-results"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <BatchSkeleton />;
  if (error && !data)
    return (
      <div className="shell page-shell narrow-state">
        <InlineAlert title="Batch unavailable" tone="danger">
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
  const progress = summary.total
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;
  const retryableFailed = data.jobs.filter(
    (job) => job.status === "failed",
  ).length;
  return (
    <div className="shell page-shell batch-page">
      <div className="batch-breadcrumb">
        <Link href="/">Workspace</Link>
        <span>/</span>
        <span>Batch</span>
      </div>
      <div className="batch-heading">
        <div>
          <div className="title-line">
            <h1>{data.batch.name ?? "Label verification batch"}</h1>
            {summary.processing ? (
              <StatusBadge status="processing" />
            ) : data.batch.status === "cancelled" ? (
              <StatusBadge status="cancelled" />
            ) : (
              <span className="status-badge status-info">
                <CheckIcon size={15} /> Batch complete
              </span>
            )}
          </div>
          <p>
            Created {formatDate(data.batch.createdAt ?? data.batch.created_at)}{" "}
            · {summary.total} applications
          </p>
        </div>
        <div className="batch-actions">
          {retryableFailed ? (
            <button
              className="button button-secondary"
              disabled={acting}
              onClick={() => void retryFailed()}
              type="button"
            >
              Retry {retryableFailed} failed
            </button>
          ) : null}
          <button
            className="button button-secondary"
            onClick={exportCsv}
            type="button"
          >
            Export results
          </button>
          <button
            aria-label="Batch actions"
            className="icon-button"
            onClick={() => setConfirm(confirm ? null : "cancel")}
            type="button"
          >
            <MoreIcon />
          </button>
        </div>
      </div>
      {error ? (
        <InlineAlert
          title="Live updates are temporarily unavailable"
          tone="warning"
        >
          Showing the most recently loaded batch state. ProofCheck will retry
          automatically.
        </InlineAlert>
      ) : null}
      {actionError ? (
        <InlineAlert title="Action not completed" tone="danger">
          {actionError}
        </InlineAlert>
      ) : null}
      {confirm ? (
        <div
          className="confirm-panel"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="confirm-title"
        >
          <div>
            <strong id="confirm-title">
              {confirm === "cancel"
                ? "Cancel queued applications?"
                : "Delete this batch?"}
            </strong>
            <p>
              {confirm === "cancel"
                ? "Processing work already underway may finish. Completed results stay available."
                : "Artwork and results will be removed and cannot be recovered."}
            </p>
          </div>
          <div>
            <button
              className="button button-quiet"
              onClick={() => setConfirm(confirm === "cancel" ? "delete" : null)}
            >
              {confirm === "cancel" ? "Delete instead" : "Keep batch"}
            </button>
            <button
              className={`button ${confirm === "delete" ? "button-danger" : "button-secondary"}`}
              disabled={acting}
              onClick={() => void batchAction(confirm)}
            >
              {acting
                ? "Working…"
                : confirm === "cancel"
                  ? "Cancel queued work"
                  : "Delete permanently"}
            </button>
            {confirm === "cancel" ? (
              <button
                className="button button-quiet"
                onClick={() => setConfirm(null)}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section
        className="batch-progress-card"
        aria-label={`${progress}% of batch completed`}
      >
        <div className="progress-overview">
          <div>
            <strong>
              {summary.processing
                ? `${summary.completed} of ${summary.total}`
                : `${summary.total} of ${summary.total}`}
            </strong>
            <span>
              {summary.processing
                ? "applications completed"
                : "applications processed"}
            </span>
          </div>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track">
          <i
            className="progress-pass"
            style={{
              width: `${summary.total ? (summary.passed / summary.total) * 100 : 0}%`,
            }}
          />
          <i
            className="progress-review"
            style={{
              width: `${summary.total ? (summary.review / summary.total) * 100 : 0}%`,
            }}
          />
          <i
            className="progress-fail"
            style={{
              width: `${summary.total ? ((summary.correction + summary.failed) / summary.total) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="progress-legend">
          <span>
            <i className="legend-pass" />
            {summary.passed} passed
          </span>
          <span>
            <i className="legend-review" />
            {summary.review} human review
          </span>
          <span>
            <i className="legend-fail" />
            {summary.correction} correction
          </span>
          <span>
            <i className="legend-neutral" />
            {summary.processing} processing
          </span>
          {summary.failed ? (
            <span>
              <i className="legend-error" />
              {summary.failed} failed
            </span>
          ) : null}
        </div>
      </section>
      <div className="stat-grid">
        <Stat
          icon={<CheckIcon />}
          label="Pre-check passed"
          value={summary.passed}
          tone="success"
        />
        <Stat
          icon={<WarningIcon />}
          label="Human review"
          value={summary.review}
          tone="warning"
        />
        <Stat
          icon={<WarningIcon />}
          label="Correction needed"
          value={summary.correction}
          tone="danger"
        />
        <Stat
          icon={<ClockIcon />}
          label="Still processing"
          value={summary.processing}
          tone="info"
        />
      </div>

      <section className="results-card" aria-labelledby="batch-results-heading">
        <div className="results-toolbar">
          <div>
            <h2 id="batch-results-heading">Applications</h2>
            <span>{shown.length} shown</span>
          </div>
          <div className="table-tools">
            <label className="search-field">
              <SearchIcon size={18} />
              <span className="sr-only">Search applications</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search application or brand"
              />
            </label>
            <label>
              <span className="sr-only">Filter status</span>
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All outcomes</option>
                <option value="processing">Processing</option>
                <option value="passed">Passed</option>
                <option value="review">Human review</option>
                <option value="correction_needed">Correction needed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Sort applications</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
              >
                <option value="application">Application ID</option>
                <option value="confidence">Highest confidence</option>
                <option value="status">Status</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
              </select>
            </label>
          </div>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Brand / type</th>
                  <th>Outcome</th>
                  <th>Confidence</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedJobs.map((job) => {
                  const status = job.outcome ?? job.status;
                  const confidence = number(job.confidence);
                  return (
                    <tr key={job.id}>
                      <td>
                        <strong>
                          {job.externalId ??
                            job.external_id ??
                            job.id.slice(0, 8).toUpperCase()}
                        </strong>
                        <small>{profileLabel(job.profile)}</small>
                      </td>
                      <td>
                        <strong>
                          {job.brandName ??
                            job.brand_name ??
                            "Pending extraction"}
                        </strong>
                        <small>
                          {job.classType ??
                            job.class_type ??
                            (terminal.has(String(status))
                              ? "Not provided"
                              : "Reading artwork…")}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={status} compact />
                      </td>
                      <td>
                        {confidence ? (
                          <div className="confidence-cell">
                            <span>
                              <i
                                style={{
                                  width: `${confidence <= 1 ? confidence * 100 : confidence}%`,
                                }}
                              />
                            </span>
                            <strong>
                              {Math.round(
                                confidence <= 1 ? confidence * 100 : confidence,
                              )}
                              %
                            </strong>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Link
                          aria-label={`Open ${job.brandName ?? job.brand_name ?? "application"} review`}
                          className="row-link"
                          href={`/reviews/${job.id}`}
                        >
                          <ArrowIcon size={17} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-table">
            <SearchIcon size={28} />
            <strong>No applications match these filters</strong>
            <p>Clear the search or choose a different outcome.</p>
            <button
              className="text-button"
              onClick={() => {
                setSearch("");
                setFilter("all");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        {shown.length > pageSize ? (
          <nav
            className="table-pagination"
            aria-label="Application result pages"
          >
            <span>
              {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, shown.length)} of {shown.length}
            </span>
            <div>
              <button
                className="button button-secondary button-small"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                className="button button-secondary button-small"
                disabled={page === totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                type="button"
              >
                Next
              </button>
            </div>
          </nav>
        ) : null}
      </section>
      <p className="expiry-line">
        Custom artwork expires{" "}
        {formatDate(data.batch.expiresAt ?? data.batch.expires_at, true)}.
        Results remain for seven days.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}
function formatDate(value?: string, future = false) {
  if (!value) return future ? "within 24 hours" : "recently";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return future
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
function profileLabel(value?: string) {
  return (
    (
      {
        faa_distilled_spirits: "Distilled spirits",
        faa_wine: "Wine",
        faa_malt_beverage: "Malt beverage",
        irc_wine_under_7: "Wine under 7%",
        irc_beer_non_faa: "Non-FAA beer",
      } as Record<string, string>
    )[value ?? ""] ?? "Beverage application"
  );
}
function BatchSkeleton() {
  return (
    <div
      className="shell page-shell batch-page"
      aria-busy="true"
      aria-label="Loading batch"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-progress" />
      <div className="stat-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton skeleton-stat" key={n} />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
