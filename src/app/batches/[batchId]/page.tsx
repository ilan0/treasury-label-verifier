import type { Metadata } from "next";
import { BatchDashboard } from "@/components/batches/batch-dashboard";

export const metadata: Metadata = { title: "Batch progress · ProofCheck" };
export default async function BatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return <BatchDashboard batchId={batchId} />;
}
