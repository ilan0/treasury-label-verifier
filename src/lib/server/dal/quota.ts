import "server-only";

import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";

export async function consumeUsageQuota(input: {
  globalLimit: number;
  ipHash: string;
  ipLimit: number;
  kind: string;
  sessionId: string;
  sessionLimit: number;
  units?: number;
}): Promise<boolean> {
  const units = input.units ?? 1;
  const values = [units, input.sessionLimit, input.ipLimit, input.globalLimit];
  if (
    values.some((value) => !Number.isInteger(value) || value < 0) ||
    units < 1
  ) {
    throw new RangeError("Invalid usage quota arguments.");
  }

  const result = await getDatabase().execute(sql`
    SELECT proofcheck_consume_usage_quota(
      ${input.sessionId},
      ${input.ipHash},
      ${input.kind},
      ${units},
      ${input.sessionLimit},
      ${input.ipLimit},
      ${input.globalLimit}
    ) AS allowed
  `);
  return result[0]?.allowed === true;
}
