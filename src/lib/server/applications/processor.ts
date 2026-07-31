import "server-only";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { applications, artifacts, batches, type JsonObject } from "@/db/schema";
import { extractApplicationDocument } from "@/lib/server/openai/extract";
import { downloadArtifact } from "@/lib/server/storage";

export function applicationFileDataUri(
  buffer: Buffer,
  mimeType: string,
): string {
  if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(mimeType))
    throw new Error("INVALID_DOCUMENT_MIME_TYPE");
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function context(applicationId: string) {
  const [record] = await getDatabase()
    .select({ application: applications, batch: batches })
    .from(applications)
    .innerJoin(batches, eq(applications.batchId, batches.id))
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!record) throw new Error("APPLICATION_NOT_FOUND");
  const [document] = await getDatabase()
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.applicationId, applicationId),
        eq(artifacts.purpose, "application_document"),
      ),
    )
    .limit(1);
  if (!document) throw new Error("APPLICATION_DOCUMENT_NOT_FOUND");
  return { ...record, document };
}

function draftFields(
  extraction: Awaited<
    ReturnType<typeof extractApplicationDocument>
  >["extraction"],
) {
  const netContents =
    extraction.netContentsValue && extraction.netContentsUnit
      ? `${extraction.netContentsValue} ${extraction.netContentsUnit.replace("_", " ")}`
      : "";
  const origin = extraction.countryOfOrigin?.trim().toLowerCase();
  const imported = Boolean(
    origin &&
    ![
      "united states",
      "united states of america",
      "u.s.",
      "u.s.a.",
      "usa",
    ].includes(origin),
  );
  return {
    brandName: extraction.brandName ?? "",
    classType: extraction.classType ?? "",
    abv:
      extraction.alcoholByVolume === null
        ? ""
        : String(extraction.alcoholByVolume),
    proof: extraction.proof === null ? "" : String(extraction.proof),
    netContents,
    producerName: extraction.responsibleName ?? "",
    producerAddress: extraction.responsibleAddress ?? "",
    responsibleRole: extraction.responsibleRole ?? "",
    countryOfOrigin: extraction.countryOfOrigin ?? "",
    appellation: extraction.appellation ?? "",
    foreignWinePercentage: "",
    ageStatement: extraction.ageStatement ?? "",
    stateOfDistillation: extraction.stateOfDistillation ?? "",
    compositionStatement: extraction.compositionStatement ?? "",
    neutralSpiritsCommodity: "",
    neutralSpiritsPercentage: "",
    profile: extraction.regulatoryProfile ?? "classification_review",
    imported,
    alcoholContentRequired: true,
    compositionStatementRequired: extraction.compositionStatement !== null,
    appellationRequired: extraction.appellation !== null,
    foreignWinePercentageRequired: false,
    ageStatementRequired: extraction.ageStatement !== null,
    stateOfDistillationRequired: extraction.stateOfDistillation !== null,
    containsSulfites: false,
    containsYellow5: false,
    containsCarmineOrCochineal: false,
    containsAspartame: false,
    containsNeutralSpirits: false,
    woodTreatmentOrColoringDisclosureRequired: false,
  };
}

export async function processApplicationDocument(applicationId: string) {
  const record = await context(applicationId);
  if (
    record.application.documentStatus === "draft" ||
    record.application.confirmed
  )
    return { replay: true, status: record.application.documentStatus };
  if (record.batch.status !== "draft")
    throw new Error("APPLICATION_BATCH_NOT_DRAFT");

  await getDatabase()
    .update(applications)
    .set({ documentStatus: "extracting" })
    .where(eq(applications.id, applicationId));
  const blob = await downloadArtifact(record.document.storagePath);
  const documentBuffer = Buffer.from(await blob.arrayBuffer());
  const result = await extractApplicationDocument({
    fileData: applicationFileDataUri(documentBuffer, record.document.mimeType),
    filename:
      record.document.storagePath.split("/").at(-1) ?? "application-document",
    detail: "high",
  });
  const draft = draftFields(result.extraction);
  await getDatabase()
    .update(applications)
    .set({
      documentStatus: "draft",
      regulatoryProfile: draft.profile,
      originType: draft.imported ? "imported" : "unknown",
      submittedFields: {
        draft,
        extraction: result.extraction,
        extractionMeta: {
          model: result.model,
          promptVersion: result.promptVersion,
          latencyMs: result.latencyMs,
          usage: result.usage,
        },
        source: "application_document",
      } as JsonObject,
    })
    .where(eq(applications.id, applicationId));
  return { draft, status: "draft" };
}

export async function markApplicationExtractionFailed(applicationId: string) {
  await getDatabase()
    .update(applications)
    .set({ documentStatus: "failed" })
    .where(eq(applications.id, applicationId));
}
