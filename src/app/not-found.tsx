import Link from "next/link";

import { InlineAlert } from "@/components/ui/inline-alert";

export default function NotFound() {
  return (
    <div className="shell page-shell narrow-state">
      <InlineAlert title="Record not found" tone="warning">
        <p>
          This link is invalid, belongs to another user session, or has expired.
        </p>
      </InlineAlert>
      <Link className="button button-primary" href="/">
        Return to workspace
      </Link>
    </div>
  );
}
