import { CheckIcon, ClockIcon, WarningIcon } from "@/components/ui/icons";

export type UiStatus =
  | "precheck_passed"
  | "completed"
  | "human_review_required"
  | "review_required"
  | "correction_needed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "queued"
  | "validating"
  | "extracting"
  | "verifying"
  | "processing"
  | "draft"
  | string;

export function statusLabel(status: UiStatus) {
  return (
    (
      {
        precheck_passed: "Pre-check passed",
        completed: "Pre-check passed",
        human_review_required: "Human review",
        review_required: "Human review",
        correction_needed: "Correction needed",
        failed: "Processing failed",
        rejected: "File rejected",
        cancelled: "Cancelled",
        queued: "Queued",
        validating: "Validating",
        extracting: "Reading label",
        verifying: "Checking rules",
        processing: "Processing",
        draft: "Draft",
      } as Record<string, string>
    )[status] ?? status.replaceAll("_", " ")
  );
}

export function statusTone(status: UiStatus) {
  if (["precheck_passed", "completed"].includes(status)) return "success";
  if (["human_review_required", "review_required"].includes(status))
    return "warning";
  if (["correction_needed", "failed", "rejected"].includes(status))
    return "danger";
  if (
    ["queued", "validating", "extracting", "verifying", "processing"].includes(
      status,
    )
  )
    return "info";
  return "neutral";
}

export function StatusBadge({
  status,
  compact = false,
}: {
  status: UiStatus;
  compact?: boolean;
}) {
  const tone = statusTone(status);
  const Icon =
    tone === "success"
      ? CheckIcon
      : tone === "danger" || tone === "warning"
        ? WarningIcon
        : ClockIcon;
  return (
    <span
      className={`status-badge status-${tone}${compact ? " status-compact" : ""}`}
    >
      <Icon size={compact ? 14 : 15} />
      {statusLabel(status)}
    </span>
  );
}
