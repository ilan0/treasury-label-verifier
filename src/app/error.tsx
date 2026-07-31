"use client";

import { InlineAlert } from "@/components/ui/inline-alert";
import Link from "next/link";

export default function ApplicationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="shell page-shell narrow-state">
      <InlineAlert title="ProofCheck could not load this view" tone="danger">
        <p>Your submitted work has not been discarded.</p>
        <p>
          Retry the request, or return to the workspace and reopen the record.
        </p>
      </InlineAlert>
      <div className="state-actions">
        <button className="button button-primary" onClick={reset} type="button">
          Try again
        </button>
        <Link className="button button-secondary" href="/">
          Return to workspace
        </Link>
      </div>
    </div>
  );
}
