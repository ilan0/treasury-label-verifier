import type { Metadata } from "next";
import { SubmitWizard } from "@/components/submission/submit-wizard";

export const metadata: Metadata = {
  title: "New verification · ProofCheck",
  description: "Compare alcohol label artwork with application data.",
};

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return (
    <SubmitWizard
      initialMode={
        mode === "batch" ? "batch" : mode === "document" ? "document" : "manual"
      }
    />
  );
}
