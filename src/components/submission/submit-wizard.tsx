"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowIcon,
  BatchIcon,
  CheckIcon,
  FileIcon,
  SparkIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { InlineAlert } from "@/components/ui/inline-alert";

type Mode = "manual" | "document" | "batch";
type Profile =
  | "faa_distilled_spirits"
  | "faa_wine"
  | "faa_malt_beverage"
  | "irc_wine_under_7"
  | "irc_beer_non_faa"
  | "classification_review";
type FormState = {
  brandName: string;
  classType: string;
  abv: string;
  proof: string;
  netContents: string;
  producerName: string;
  producerAddress: string;
  responsibleRole: string;
  countryOfOrigin: string;
  appellation: string;
  foreignWinePercentage: string;
  ageStatement: string;
  stateOfDistillation: string;
  compositionStatement: string;
  neutralSpiritsCommodity: string;
  neutralSpiritsPercentage: string;
  profile: Profile;
  imported: boolean;
  alcoholContentRequired: boolean;
  compositionStatementRequired: boolean;
  appellationRequired: boolean;
  foreignWinePercentageRequired: boolean;
  ageStatementRequired: boolean;
  stateOfDistillationRequired: boolean;
  containsSulfites: boolean;
  containsYellow5: boolean;
  containsCarmineOrCochineal: boolean;
  containsAspartame: boolean;
  containsNeutralSpirits: boolean;
  woodTreatmentOrColoringDisclosureRequired: boolean;
};
type UploadTicket = {
  signedUrl?: string;
  url?: string;
  token?: string;
  path?: string;
  id?: string;
};
type DocumentStage = "file" | "uploading" | "extracting" | "confirm";
type DraftContext = {
  batchId: string;
  applicationId: string;
  updatedAt?: string;
};
type ApplicationDraftRecord = {
  id: string;
  documentStatus?: string;
  document_status?: string;
  updatedAt?: string;
  updated_at?: string;
  submittedFields?: { draft?: Partial<FormState> };
  submitted_fields?: { draft?: Partial<FormState> };
};
type ApiPayload = {
  id?: string;
  batchId?: string;
  applicationId?: string;
  jobId?: string;
  data?: ApiPayload;
  batch?: { id?: string };
  application?: { id?: string };
  uploads?: UploadTicket[];
  upload?: UploadTicket;
  message?: string;
  error?: string;
};

const profiles: { value: Profile; label: string; note: string }[] = [
  {
    value: "faa_distilled_spirits",
    label: "Distilled spirits",
    note: "27 CFR Parts 5 and 16",
  },
  {
    value: "faa_wine",
    label: "Wine (7% ABV or more)",
    note: "27 CFR Parts 4 and 16",
  },
  {
    value: "faa_malt_beverage",
    label: "Malt beverage",
    note: "27 CFR Parts 7 and 16",
  },
  {
    value: "irc_wine_under_7",
    label: "Wine (under 7% ABV)",
    note: "IRC/ABLA; FDA labeling also applies",
  },
  {
    value: "irc_beer_non_faa",
    label: "Beer outside FAA definition",
    note: "IRC/ABLA; FDA labeling also applies",
  },
  {
    value: "classification_review",
    label: "Not sure / other fermented product",
    note: "Route jurisdiction to a reviewer",
  },
];

const defaultForm: FormState = {
  brandName: "",
  classType: "",
  abv: "",
  proof: "",
  netContents: "750 mL",
  producerName: "",
  producerAddress: "",
  responsibleRole: "",
  countryOfOrigin: "",
  appellation: "",
  foreignWinePercentage: "",
  ageStatement: "",
  stateOfDistillation: "",
  compositionStatement: "",
  neutralSpiritsCommodity: "",
  neutralSpiritsPercentage: "",
  profile: "faa_distilled_spirits",
  imported: false,
  alcoholContentRequired: true,
  compositionStatementRequired: false,
  appellationRequired: false,
  foreignWinePercentageRequired: false,
  ageStatementRequired: false,
  stateOfDistillationRequired: false,
  containsSulfites: false,
  containsYellow5: false,
  containsCarmineOrCochineal: false,
  containsAspartame: false,
  containsNeutralSpirits: false,
  woodTreatmentOrColoringDisclosureRequired: false,
};

function getData(payload: ApiPayload) {
  return payload.data ?? payload;
}

export function SubmitWizard({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [artwork, setArtwork] = useState<File[]>([]);
  const [applicationFile, setApplicationFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<File | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [documentStage, setDocumentStage] = useState<DocumentStage>("file");
  const [draftContext, setDraftContext] = useState<DraftContext | null>(null);
  const documentPoll = useRef<AbortController | null>(null);

  useEffect(() => () => documentPoll.current?.abort(), []);

  const profile = useMemo(
    () => profiles.find((item) => item.value === form.profile),
    [form.profile],
  );
  function field<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }

  function validateDetails() {
    const next: Record<string, string> = {};
    if (!form.brandName.trim())
      next.brandName = "Enter the brand name from the application.";
    if (!form.classType.trim())
      next.classType = "Enter the class or type designation.";
    if (!form.netContents.trim())
      next.netContents = "Enter the declared net contents.";
    if (!form.producerName.trim())
      next.producerName = "Enter the bottler, producer, or importer name.";
    if (!form.producerAddress.trim())
      next.producerAddress = "Enter the responsible party address.";
    if (form.imported && !form.countryOfOrigin.trim())
      next.countryOfOrigin = "Country of origin is required for an import.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function nextStep() {
    setSubmitError("");
    if (mode === "manual" && step === 1 && !validateDetails()) return;
    if (mode === "document" && step === 1) {
      if (!applicationFile) {
        setErrors({
          applicationFile: "Choose an application document to continue.",
        });
        return;
      }
      void startDocumentExtraction();
      return;
    }
    if (mode === "batch" && step === 1 && !manifest) {
      setErrors({ manifest: "Choose the completed CSV manifest to continue." });
      return;
    }
    if (step < 2) setStep(step + 1);
  }

  function resetMode(nextMode: Mode) {
    documentPoll.current?.abort();
    setMode(nextMode);
    setStep(1);
    setErrors({});
    setSubmitError("");
    setDocumentStage("file");
    setDraftContext(null);
  }

  async function request(path: string, init: RequestInit) {
    const response = await fetch(path, init);
    const payload = (await response.json().catch(() => ({}))) as ApiPayload;
    if (!response.ok)
      throw new Error(
        payload.message ??
          payload.error ??
          "The request could not be completed.",
      );
    return getData(payload);
  }

  async function uploadFiles(
    files: File[],
    context: { batchId: string; applicationId?: string; purpose: string },
  ) {
    if (!files.length) return;
    const signed = await request("/api/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...context,
        files: files.map((file, index) => ({
          name: file.name,
          size: file.size,
          type: clientMimeType(file),
          panelType: index === 0 ? "brand" : "other",
        })),
      }),
    });
    const tickets = signed.uploads ?? (signed.upload ? [signed.upload] : []);
    if (tickets.length !== files.length)
      throw new Error("Secure upload targets were not created for every file.");
    await Promise.all(
      tickets.map(async (ticket, index) => {
        const url = ticket.signedUrl ?? ticket.url;
        if (!url) throw new Error("A secure upload target is missing.");
        const formData = new FormData();
        formData.append("cacheControl", "3600");
        formData.append("", files[index]);
        const response = await fetch(url, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: formData,
        });
        if (!response.ok)
          throw new Error(`${files[index].name} could not be uploaded.`);
      }),
    );
    await request("/api/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...context,
        uploads: tickets.map((ticket, index) => ({
          ...ticket,
          name: files[index].name,
          size: files[index].size,
          type: clientMimeType(files[index]),
        })),
      }),
    });
  }

  async function startDocumentExtraction() {
    if (!applicationFile) return;
    setBusy(true);
    setDocumentStage("uploading");
    setSubmitError("");
    setErrors({});
    try {
      const created = await request("/api/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          mode: "single",
          name: applicationFile.name.replace(/\.[^.]+$/, ""),
        }),
      });
      const batchId = created.batchId ?? created.batch?.id ?? created.id;
      const applicationId = created.applicationId ?? created.application?.id;
      if (!batchId || !applicationId)
        throw new Error("The application draft could not be created.");
      await uploadFiles([applicationFile], {
        batchId,
        applicationId,
        purpose: "application_document",
      });
      await request("/api/applications/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, applicationId }),
      });
      setDraftContext({ batchId, applicationId });
      setDocumentStage("extracting");
      setBusy(false);
      void waitForApplicationDraft(batchId, applicationId);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "The application could not be extracted.",
      );
      setDocumentStage("file");
      setBusy(false);
    }
  }

  async function waitForApplicationDraft(
    batchId: string,
    applicationId: string,
  ) {
    documentPoll.current?.abort();
    const controller = new AbortController();
    documentPoll.current = controller;
    try {
      for (let attempt = 0; attempt < 75; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const response = await fetch(`/api/applications/${applicationId}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: {
            application?: ApplicationDraftRecord;
          } & ApplicationDraftRecord;
          message?: string;
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            payload.message ??
              payload.error ??
              "Application status could not be loaded.",
          );
        const source = payload.data;
        const application = source?.application ?? source;
        if (!application) continue;
        const status =
          application.documentStatus ?? application.document_status;
        if (status === "failed")
          throw new Error(
            "The document could not be read. Check its quality or enter the application manually.",
          );
        if (status === "draft") {
          const fields =
            application.submittedFields?.draft ??
            application.submitted_fields?.draft;
          setForm({ ...defaultForm, ...fields });
          setDraftContext({
            batchId,
            applicationId,
            updatedAt: application.updatedAt ?? application.updated_at,
          });
          setDocumentStage("confirm");
          return;
        }
      }
      throw new Error(
        "Document extraction is taking longer than expected. Try again or enter the fields manually.",
      );
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "The application could not be extracted.",
      );
      setDocumentStage("file");
    }
  }

  async function confirmDocumentDraft() {
    if (!draftContext || !validateDetails()) return;
    setBusy(true);
    setSubmitError("");
    try {
      const updated = await request(
        `/api/applications/${draftContext.applicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: form,
            confirm: true,
            expectedUpdatedAt: draftContext.updatedAt,
          }),
        },
      );
      const application = updated.application as
        ApplicationDraftRecord | undefined;
      setDraftContext((current) =>
        current
          ? {
              ...current,
              updatedAt: application?.updatedAt ?? application?.updated_at,
            }
          : current,
      );
      setStep(2);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "The application draft could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const files = mode === "batch" ? batchFiles : artwork;
    if (!files.length) {
      setErrors({
        artwork:
          mode === "batch"
            ? "Choose the batch artwork files."
            : "Choose at least one label image or PDF.",
      });
      return;
    }
    setBusy(true);
    setSubmitError("");
    try {
      const idempotencyKey = crypto.randomUUID();
      let batchId = mode === "document" ? draftContext?.batchId : undefined;
      let applicationId =
        mode === "document" ? draftContext?.applicationId : undefined;
      if (!batchId) {
        const created = await request("/api/batches", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            mode: mode === "batch" ? "batch" : "single",
            name:
              mode === "batch"
                ? manifest?.name.replace(/\.csv$/i, "")
                : form.brandName,
            application:
              mode === "manual"
                ? {
                    regulatoryProfile: form.profile,
                    beverageProfile: form.profile,
                    originType: form.imported ? "imported" : "domestic",
                    fields: form,
                  }
                : undefined,
            manifest:
              mode === "batch" && manifest
                ? { name: manifest.name, text: await manifest.text() }
                : undefined,
          }),
        });
        batchId = created.batchId ?? created.batch?.id ?? created.id;
        applicationId = created.applicationId ?? created.application?.id;
      }
      if (!batchId) throw new Error("The draft batch was not created.");
      await uploadFiles(files, {
        batchId,
        applicationId,
        purpose: "label_artwork",
      });
      const submitted = await request(`/api/batches/${batchId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ confirm: true }),
      });
      const jobId = submitted.jobId ?? submitted.id;
      router.push(
        mode === "batch" || !jobId
          ? `/batches/${batchId}`
          : `/reviews/${jobId}`,
      );
    } catch (reason) {
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "The verification could not be started.",
      );
      setBusy(false);
    }
  }

  const modes: {
    id: Mode;
    label: string;
    description: string;
    icon: typeof FileIcon;
  }[] = [
    {
      id: "manual",
      label: "Enter application fields",
      description: "Best for one application",
      icon: CheckIcon,
    },
    {
      id: "document",
      label: "Upload an application",
      description: "Extract a PDF or image draft",
      icon: FileIcon,
    },
    {
      id: "batch",
      label: "Process a batch",
      description: "Map up to 300 applications",
      icon: BatchIcon,
    },
  ];

  return (
    <div className="shell page-shell">
      <div className="page-heading compact-heading">
        <div>
          <p className="kicker">New verification</p>
          <h1>Compare application data with label artwork</h1>
          <p>
            Choose the fastest way to provide the submitted application. You can
            review everything before processing begins.
          </p>
        </div>
        <div className="retention-note">
          <span>Private storage</span>
          <strong>Artwork expires after 24 hours</strong>
        </div>
      </div>
      <div className="wizard-layout">
        <aside className="wizard-sidebar" aria-label="Submission method">
          <p>Application source</p>
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-pressed={mode === item.id}
                className={mode === item.id ? "active" : ""}
                key={item.id}
                onClick={() => resetMode(item.id)}
                type="button"
              >
                <span>
                  <Icon size={20} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {mode === item.id ? (
                  <CheckIcon className="method-check" size={17} />
                ) : null}
              </button>
            );
          })}
          <div className="wizard-help">
            <SparkIcon size={19} />
            <p>
              <strong>Want the guided demo?</strong>
              <br />
              Built-in examples require no files.
            </p>
            <Link href="/">View examples</Link>
          </div>
        </aside>
        <section
          className="wizard-card"
          aria-label="Verification submission form"
        >
          <div className="wizard-progress">
            <span className="active">
              <i>1</i>
              {mode === "manual"
                ? "Application details"
                : mode === "document"
                  ? "Application file"
                  : "Batch manifest"}
            </span>
            <b />
            <span className={step === 2 ? "active" : ""}>
              <i>2</i>Label artwork
            </span>
          </div>
          {submitError ? (
            <InlineAlert title="Verification was not started" tone="danger">
              <p>{submitError}</p>
              <p>
                Your files and form entries are still here. Check the message
                and try again.
              </p>
            </InlineAlert>
          ) : null}
          {step === 1 && mode === "manual" ? (
            <ManualFields
              form={form}
              errors={errors}
              field={field}
              profileNote={profile?.note}
            />
          ) : null}
          {step === 1 && mode === "document" ? (
            documentStage === "file" ? (
              <DocumentStep
                file={applicationFile}
                error={errors.applicationFile}
                onFile={(file) => {
                  setApplicationFile(file);
                  setErrors({});
                  setSubmitError("");
                }}
              />
            ) : documentStage === "confirm" ? (
              <ManualFields
                form={form}
                errors={errors}
                field={field}
                profileNote={profile?.note}
                title="Confirm the extracted draft"
                description="Check every value against the document. Processing cannot begin until you explicitly confirm these application facts."
              />
            ) : (
              <DocumentExtractionStatus stage={documentStage} />
            )
          ) : null}
          {step === 1 && mode === "batch" ? (
            <BatchManifestStep
              file={manifest}
              error={errors.manifest}
              onFile={(file) => {
                setManifest(file);
                setErrors({});
              }}
            />
          ) : null}
          {step === 2 ? (
            <ArtworkStep
              batch={mode === "batch"}
              error={errors.artwork}
              files={mode === "batch" ? batchFiles : artwork}
              onFiles={(files) => {
                if (mode === "batch") setBatchFiles(files);
                else setArtwork(files);
                setErrors({});
              }}
            />
          ) : null}
          <div className="wizard-actions">
            {step === 2 ? (
              <button
                className="button button-quiet"
                disabled={busy}
                onClick={() => setStep(1)}
                type="button"
              >
                Back
              </button>
            ) : (
              <span />
            )}{" "}
            {step === 1 ? (
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  (mode === "document" &&
                    ["uploading", "extracting"].includes(documentStage))
                }
                onClick={
                  mode === "document" && documentStage === "confirm"
                    ? () => void confirmDocumentDraft()
                    : nextStep
                }
                type="button"
              >
                {mode === "document" && documentStage === "file"
                  ? busy
                    ? "Uploading application…"
                    : "Extract application draft"
                  : mode === "document" &&
                      ["uploading", "extracting"].includes(documentStage)
                    ? "Extracting application…"
                    : mode === "document" && documentStage === "confirm"
                      ? busy
                        ? "Confirming…"
                        : "Confirm and continue"
                      : "Continue to artwork"}{" "}
                <ArrowIcon size={17} />
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={submit}
                type="button"
              >
                {busy ? (
                  <>
                    <span className="spinner" />
                    Uploading securely…
                  </>
                ) : (
                  <>
                    Start verification <ArrowIcon size={17} />
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ManualFields({
  form,
  errors,
  field,
  profileNote,
  title = "Application details",
  description = "Enter values exactly as submitted. ProofCheck handles harmless punctuation and casing differences.",
}: {
  form: FormState;
  errors: Record<string, string>;
  field: <K extends keyof FormState>(name: K, value: FormState[K]) => void;
  profileNote?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="wizard-body">
      <div className="wizard-title">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {Object.values(errors).some(Boolean) ? (
        <InlineAlert tone="danger" title="Check the highlighted fields">
          Complete the required application fields before continuing.
        </InlineAlert>
      ) : null}
      <div className="form-grid">
        <label className="field field-wide">
          <span>Beverage category</span>
          <select
            value={form.profile}
            onChange={(event) =>
              field("profile", event.target.value as Profile)
            }
          >
            {profiles.map((profile) => (
              <option key={profile.value} value={profile.value}>
                {profile.label}
              </option>
            ))}
          </select>
          <small>{profileNote}</small>
        </label>
        <label className={`field ${errors.brandName ? "field-error" : ""}`}>
          <span>
            Brand name <b>*</b>
          </span>
          <input
            aria-describedby={errors.brandName ? "brand-error" : undefined}
            value={form.brandName}
            onChange={(event) => field("brandName", event.target.value)}
            placeholder="e.g., OLD TOM DISTILLERY"
          />
          {errors.brandName ? (
            <small id="brand-error">{errors.brandName}</small>
          ) : null}
        </label>
        <label className={`field ${errors.classType ? "field-error" : ""}`}>
          <span>
            Class / type <b>*</b>
          </span>
          <input
            value={form.classType}
            onChange={(event) => field("classType", event.target.value)}
            placeholder="e.g., Kentucky Straight Bourbon Whiskey"
          />
          {errors.classType ? <small>{errors.classType}</small> : null}
        </label>
        <label className="field">
          <span>Alcohol by volume</span>
          <input
            inputMode="decimal"
            value={form.abv}
            onChange={(event) => field("abv", event.target.value)}
            placeholder="e.g., 45%"
          />
          <small>May be optional for certain wine or malt beverages.</small>
        </label>
        <label className={`field ${errors.netContents ? "field-error" : ""}`}>
          <span>
            Net contents <b>*</b>
          </span>
          <input
            value={form.netContents}
            onChange={(event) => field("netContents", event.target.value)}
            placeholder="750 mL"
          />
          {errors.netContents ? <small>{errors.netContents}</small> : null}
        </label>
        <label className={`field ${errors.producerName ? "field-error" : ""}`}>
          <span>
            Bottler / producer / importer <b>*</b>
          </span>
          <input
            value={form.producerName}
            onChange={(event) => field("producerName", event.target.value)}
            placeholder="Old Tom Spirits LLC"
          />
          {errors.producerName ? <small>{errors.producerName}</small> : null}
        </label>
        <label
          className={`field ${errors.producerAddress ? "field-error" : ""}`}
        >
          <span>
            City and state / address <b>*</b>
          </span>
          <input
            value={form.producerAddress}
            onChange={(event) => field("producerAddress", event.target.value)}
            placeholder="Louisville, Kentucky"
          />
          {errors.producerAddress ? (
            <small>{errors.producerAddress}</small>
          ) : null}
        </label>
        <label className="check-field field-wide">
          <input
            checked={form.imported}
            onChange={(event) => field("imported", event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>This is an imported product</strong>
            <small>
              Country-of-origin and importer requirements will apply.
            </small>
          </span>
        </label>
        {form.imported ? (
          <label
            className={`field field-wide ${errors.countryOfOrigin ? "field-error" : ""}`}
          >
            <span>
              Country of origin <b>*</b>
            </span>
            <input
              value={form.countryOfOrigin}
              onChange={(event) => field("countryOfOrigin", event.target.value)}
              placeholder="e.g., France"
            />
            {errors.countryOfOrigin ? (
              <small>{errors.countryOfOrigin}</small>
            ) : null}
          </label>
        ) : null}
        <AdvancedApplicationFacts form={form} field={field} />
      </div>
    </div>
  );
}

function AdvancedApplicationFacts({
  form,
  field,
}: {
  form: FormState;
  field: <K extends keyof FormState>(name: K, value: FormState[K]) => void;
}) {
  const wine = form.profile === "faa_wine";
  const spirits = form.profile === "faa_distilled_spirits";
  const malt = form.profile === "faa_malt_beverage";
  return (
    <details className="advanced-facts field-wide">
      <summary>
        <span>
          <strong>Conditional application facts</strong>
          <small>
            Additives, claims, age, appellation, and other facts that activate
            additional rules
          </small>
        </span>
      </summary>
      <div className="advanced-facts-grid">
        <label className="field">
          <span>Responsible-party role phrase</span>
          <input
            value={form.responsibleRole}
            onChange={(event) => field("responsibleRole", event.target.value)}
            placeholder={form.imported ? "Imported by" : "Bottled by"}
          />
        </label>
        {spirits ? (
          <label className="field">
            <span>Proof (if declared)</span>
            <input
              inputMode="decimal"
              value={form.proof}
              onChange={(event) => field("proof", event.target.value)}
              placeholder="90"
            />
          </label>
        ) : null}
        {wine || malt ? (
          <ConditionalCheck
            checked={form.alcoholContentRequired}
            label="Alcohol-content statement required"
            note="Clear this only when the selected beverage qualifies for an exception."
            onChange={(value) => field("alcoholContentRequired", value)}
          />
        ) : null}
        {wine ? (
          <>
            <ConditionalCheck
              checked={form.appellationRequired}
              label="Appellation is required"
              onChange={(value) => field("appellationRequired", value)}
            />
            {form.appellationRequired ? (
              <label className="field">
                <span>Appellation of origin</span>
                <input
                  value={form.appellation}
                  onChange={(event) => field("appellation", event.target.value)}
                  placeholder="Napa Valley"
                />
              </label>
            ) : null}
            <ConditionalCheck
              checked={form.foreignWinePercentageRequired}
              label="Foreign-wine percentage is required"
              onChange={(value) =>
                field("foreignWinePercentageRequired", value)
              }
            />
            {form.foreignWinePercentageRequired ? (
              <label className="field">
                <span>Foreign wine percentage</span>
                <input
                  inputMode="decimal"
                  value={form.foreignWinePercentage}
                  onChange={(event) =>
                    field("foreignWinePercentage", event.target.value)
                  }
                  placeholder="25%"
                />
              </label>
            ) : null}
          </>
        ) : null}
        {spirits ? (
          <>
            <ConditionalCheck
              checked={form.ageStatementRequired}
              label="Age statement is required"
              onChange={(value) => field("ageStatementRequired", value)}
            />
            {form.ageStatementRequired ? (
              <label className="field">
                <span>Expected age statement</span>
                <input
                  value={form.ageStatement}
                  onChange={(event) =>
                    field("ageStatement", event.target.value)
                  }
                  placeholder="Aged 4 years"
                />
              </label>
            ) : null}
            <ConditionalCheck
              checked={form.stateOfDistillationRequired}
              label="State of distillation is required"
              onChange={(value) => field("stateOfDistillationRequired", value)}
            />
            {form.stateOfDistillationRequired ? (
              <label className="field">
                <span>State of distillation</span>
                <input
                  value={form.stateOfDistillation}
                  onChange={(event) =>
                    field("stateOfDistillation", event.target.value)
                  }
                  placeholder="Kentucky"
                />
              </label>
            ) : null}
            <ConditionalCheck
              checked={form.containsNeutralSpirits}
              label="Contains neutral spirits"
              onChange={(value) => field("containsNeutralSpirits", value)}
            />
            {form.containsNeutralSpirits ? (
              <>
                <label className="field">
                  <span>Neutral spirits commodity</span>
                  <input
                    value={form.neutralSpiritsCommodity}
                    onChange={(event) =>
                      field("neutralSpiritsCommodity", event.target.value)
                    }
                    placeholder="Grain"
                  />
                </label>
                <label className="field">
                  <span>Neutral spirits percentage</span>
                  <input
                    inputMode="decimal"
                    value={form.neutralSpiritsPercentage}
                    onChange={(event) =>
                      field("neutralSpiritsPercentage", event.target.value)
                    }
                    placeholder="20%"
                  />
                </label>
              </>
            ) : null}
            <ConditionalCheck
              checked={form.woodTreatmentOrColoringDisclosureRequired}
              label="Coloring or wood-treatment disclosure is required"
              onChange={(value) =>
                field("woodTreatmentOrColoringDisclosureRequired", value)
              }
            />
          </>
        ) : null}
        <ConditionalCheck
          checked={form.compositionStatementRequired}
          label="Composition statement is required"
          onChange={(value) => field("compositionStatementRequired", value)}
        />
        {form.compositionStatementRequired ? (
          <label className="field">
            <span>Expected composition statement</span>
            <input
              value={form.compositionStatement}
              onChange={(event) =>
                field("compositionStatement", event.target.value)
              }
            />
          </label>
        ) : null}
        <div className="advanced-additives">
          <strong>Formula facts activating ingredient disclosures</strong>
          <ConditionalCheck
            checked={form.containsSulfites}
            label="Contains sulfites"
            onChange={(value) => field("containsSulfites", value)}
          />
          <ConditionalCheck
            checked={form.containsYellow5}
            label="Contains FD&C Yellow No. 5"
            onChange={(value) => field("containsYellow5", value)}
          />
          <ConditionalCheck
            checked={form.containsCarmineOrCochineal}
            label="Contains carmine or cochineal extract"
            onChange={(value) => field("containsCarmineOrCochineal", value)}
          />
          <ConditionalCheck
            checked={form.containsAspartame}
            label="Contains aspartame"
            onChange={(value) => field("containsAspartame", value)}
          />
        </div>
      </div>
    </details>
  );
}

function ConditionalCheck({
  checked,
  label,
  note,
  onChange,
}: {
  checked: boolean;
  label: string;
  note?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check-field advanced-check">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        <strong>{label}</strong>
        {note ? <small>{note}</small> : null}
      </span>
    </label>
  );
}

function FileDrop({
  accept,
  file,
  files,
  multiple = false,
  onFiles,
  title,
  detail,
  error,
}: {
  accept: string;
  file?: File | null;
  files?: File[];
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  detail: string;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const selected = files ?? (file ? [file] : []);
  return (
    <div>
      <button
        className={`dropzone ${error ? "dropzone-error" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFiles(Array.from(event.dataTransfer.files));
        }}
        type="button"
      >
        <UploadIcon size={28} />
        <strong>{title}</strong>
        <span>{detail}</span>
        <small>or choose {multiple ? "files" : "a file"}</small>
      </button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
      />
      {error ? (
        <p className="field-error-text" role="alert">
          {error}
        </p>
      ) : null}
      {selected.length ? (
        <ul className="file-list">
          {selected.slice(0, 8).map((item) => (
            <li key={`${item.name}-${item.size}`}>
              <FileIcon size={18} />
              <span>
                <strong>{item.name}</strong>
                <small>{formatBytes(item.size)}</small>
              </span>
              <CheckIcon size={17} />
            </li>
          ))}
          {selected.length > 8 ? (
            <li className="file-count">
              + {selected.length - 8} more files selected
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
function formatBytes(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function clientMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        pdf: "application/pdf",
        txt: "text/plain",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      } as Record<string, string>
    )[extension ?? ""] ?? "application/octet-stream"
  );
}
function DocumentExtractionStatus({
  stage,
}: {
  stage: "uploading" | "extracting";
}) {
  return (
    <div className="wizard-body document-processing" aria-live="polite">
      <div className="processing-orbit">
        <FileIcon size={28} />
        <i />
      </div>
      <h2>
        {stage === "uploading"
          ? "Uploading the application securely"
          : "Extracting an editable draft"}
      </h2>
      <p>
        {stage === "uploading"
          ? "ProofCheck is registering the private document before queuing extraction."
          : "The worker is reading submitted facts only. It is not making a compliance decision."}
      </p>
      <div className="document-stage-row">
        <span className="done">
          <CheckIcon size={15} /> Document received
        </span>
        <span className={stage === "extracting" ? "active" : ""}>
          <SparkIcon size={15} /> Structured extraction
        </span>
        <span>
          <CheckIcon size={15} /> Human confirmation
        </span>
      </div>
      <small>You can leave this page; the durable worker will continue.</small>
    </div>
  );
}
function DocumentStep({
  file,
  onFile,
  error,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  error?: string;
}) {
  return (
    <div className="wizard-body">
      <div className="wizard-title">
        <h2>Upload the application</h2>
        <p>
          ProofCheck will extract a draft from the document. Extracted values
          remain editable and require confirmation.
        </p>
      </div>
      <FileDrop
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
        file={file}
        error={error}
        onFiles={(files) => onFile(files[0] ?? null)}
        title="Drop an application document here"
        detail="PDF, image, text, or Word document · 10 MB maximum"
      />
      <InlineAlert tone="info" title="Human confirmation is required">
        Document extraction pre-fills application fields; it never treats
        inferred data as submitted fact.
      </InlineAlert>
    </div>
  );
}
function BatchManifestStep({
  file,
  onFile,
  error,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  error?: string;
}) {
  return (
    <div className="wizard-body">
      <div className="wizard-title">
        <h2>Map a batch manifest</h2>
        <p>
          One CSV can map as many as 300 applications and 600 label-panel files.
        </p>
      </div>
      <div className="template-callout">
        <BatchIcon size={24} />
        <div>
          <strong>Start with the ProofCheck template</strong>
          <p>Required columns and sample rows are included.</p>
        </div>
        <a
          className="button button-secondary button-small"
          href="/sample-batch.csv"
          download
        >
          Download CSV
        </a>
      </div>
      <FileDrop
        accept=".csv,text/csv"
        file={file}
        error={error}
        onFiles={(files) => onFile(files[0] ?? null)}
        title="Drop the completed manifest here"
        detail="CSV · UTF-8 · one or more rows per application"
      />
      <p className="fine-print">
        The entire manifest is validated before jobs are created. You will
        receive row-level feedback for unmapped or duplicate files.
      </p>
    </div>
  );
}
function ArtworkStep({
  batch,
  files,
  onFiles,
  error,
}: {
  batch: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  error?: string;
}) {
  return (
    <div className="wizard-body">
      <div className="wizard-title">
        <h2>
          {batch ? "Add the batch artwork" : "Add the complete label set"}
        </h2>
        <p>
          {batch
            ? "Filenames must match the manifest exactly."
            : "Add front, back, neck, strip, or other panels together for the most accurate result."}
        </p>
      </div>
      <FileDrop
        accept=".pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf"
        files={files}
        multiple
        onFiles={onFiles}
        error={error}
        title={
          batch ? "Drop all mapped artwork here" : "Drop label artwork here"
        }
        detail={`${batch ? "Up to 600 files · 300 MB total" : "JPG, PNG, WebP, or PDF"} · 10 MB per file`}
      />
      <InlineAlert tone="warning" title="Evidence quality affects routing">
        Glare, blur, severe perspective, or missing panels will trigger human
        review—not a false compliance result.
      </InlineAlert>
    </div>
  );
}
