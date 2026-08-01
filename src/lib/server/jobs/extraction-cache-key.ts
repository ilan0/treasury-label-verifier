import { createHash } from "node:crypto";

import type { ApplicationData } from "@/lib/domain";

export function createExtractionCacheKey(input: {
  application: ApplicationData;
  artwork: Array<{ panelType: string | null; sha256: string }>;
  artworkPath?: string;
  model: string;
  promptVersion: string;
  scopeId: string;
  strategyVersion: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        application: input.application,
        artwork: input.artwork.length
          ? input.artwork.map((item) => [item.panelType, item.sha256])
          : input.artworkPath,
        model: input.model,
        prompt: input.promptVersion,
        scope: input.scopeId,
        strategy: input.strategyVersion,
      }),
    )
    .digest("hex");
}
