import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/reviews/review-workspace";

export const metadata: Metadata = { title: "Label review · ProofCheck" };
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <ReviewWorkspace jobId={jobId} />;
}
