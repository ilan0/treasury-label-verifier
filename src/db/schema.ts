import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const batchModeEnum = pgEnum("batch_mode", [
  "single",
  "batch",
  "demo",
  "benchmark",
]);

export const batchStatusEnum = pgEnum("batch_status", [
  "draft",
  "queued",
  "processing",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "expired",
]);

export const regulatoryProfileEnum = pgEnum("regulatory_profile", [
  "faa_distilled_spirits",
  "faa_wine",
  "faa_malt_beverage",
  "irc_wine_under_7",
  "irc_beer_non_faa",
  "classification_review",
]);

export const originTypeEnum = pgEnum("origin_type", [
  "domestic",
  "imported",
  "unknown",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "none",
  "queued",
  "extracting",
  "draft",
  "confirmed",
  "failed",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "queued",
  "validating",
  "extracting",
  "verifying",
  "completed",
  "review_required",
  "correction_needed",
  "rejected",
  "failed",
  "cancelled",
  "expired",
]);

export const jobOutcomeEnum = pgEnum("job_outcome", [
  "precheck_passed",
  "human_review_required",
  "correction_needed",
]);

export const artifactPurposeEnum = pgEnum("artifact_purpose", [
  "label_artwork",
  "application_document",
]);

export const labelPanelEnum = pgEnum("label_panel", [
  "brand",
  "front",
  "back",
  "side",
  "strip",
  "neck",
  "collarette",
  "keg",
  "container_marking",
  "carton",
  "closure",
  "bottom",
  "other",
]);

export const extractionSourceEnum = pgEnum("extraction_source", [
  "openai",
  "cached_demo",
  "cached_extraction",
]);

export const ruleStatusEnum = pgEnum("rule_status", [
  "pass",
  "fail",
  "review",
  "not_applicable",
  "not_assessed",
]);

export const ruleSeverityEnum = pgEnum("rule_severity", [
  "information",
  "warning",
  "error",
]);

export const reviewDecisionEnum = pgEnum("review_decision", [
  "confirmed_clear",
  "accepted_with_override",
  "return_for_correction",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "sending",
  "sent",
  "failed",
]);

export const processingAttemptStatusEnum = pgEnum("processing_attempt_status", [
  "running",
  "completed",
  "failed",
]);

export type JsonObject = Record<string, unknown>;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: text("session_id").notNull(),
    idempotencyKey: text("idempotency_key"),
    name: text("name").notNull(),
    mode: batchModeEnum("mode").notNull(),
    status: batchStatusEnum("status").default("draft").notNull(),
    totalCount: integer("total_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index("batches_session_created_idx").on(table.sessionId, table.createdAt),
    index("batches_status_idx").on(table.status),
    index("batches_expires_idx").on(table.expiresAt),
    uniqueIndex("batches_session_idempotency_uidx").on(
      table.sessionId,
      table.idempotencyKey,
    ),
    check(
      "batches_total_count_check",
      sql`${table.totalCount} between 0 and 300`,
    ),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    regulatoryProfile: regulatoryProfileEnum("regulatory_profile").notNull(),
    originType: originTypeEnum("origin_type").default("unknown").notNull(),
    submittedFields: jsonb("submitted_fields")
      .$type<JsonObject>()
      .default({})
      .notNull(),
    documentPath: text("document_path"),
    documentStatus: documentStatusEnum("document_status")
      .default("none")
      .notNull(),
    confirmed: boolean("confirmed").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("applications_batch_external_uidx").on(
      table.batchId,
      table.externalId,
    ),
    index("applications_batch_idx").on(table.batchId),
  ],
);

export const labelJobs = pgTable(
  "label_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    status: jobStatusEnum("status").default("draft").notNull(),
    outcome: jobOutcomeEnum("outcome"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    confidence: real("confidence"),
    latencyMs: integer("latency_ms"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    rulesetVersion: text("ruleset_version"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    reviewVersion: integer("review_version").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("label_jobs_application_uidx").on(table.applicationId),
    index("label_jobs_batch_status_idx").on(table.batchId, table.status),
    index("label_jobs_status_created_idx").on(table.status, table.createdAt),
    index("label_jobs_expires_idx").on(table.expiresAt),
    check("label_jobs_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "label_jobs_confidence_check",
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`,
    ),
    check("label_jobs_review_version_check", sql`${table.reviewVersion} >= 0`),
  ],
);

export type ProcessingTimingSpans = {
  extractionMs?: number;
  persistenceMs?: number;
  preprocessingMs?: number;
  queueMs?: number;
  totalMs?: number;
  validationMs?: number;
  verificationMs?: number;
};

export const processingAttempts = pgTable(
  "processing_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => labelJobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inngestRunId: text("inngest_run_id"),
    status: processingAttemptStatusEnum("status").default("running").notNull(),
    replayCount: integer("replay_count").default(0).notNull(),
    lastReplayedAt: timestamp("last_replayed_at", { withTimezone: true }),
    model: text("model"),
    serviceTier: text("service_tier"),
    modelVariant: text("model_variant"),
    promptVersion: text("prompt_version"),
    timingSpans: jsonb("timing_spans")
      .$type<ProcessingTimingSpans>()
      .default({})
      .notNull(),
    totalLatencyMs: integer("total_latency_ms"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    cachedInputTokens: integer("cached_input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    reasoningTokens: integer("reasoning_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    errorCode: text("error_code"),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("processing_attempts_idempotency_uidx").on(
      table.idempotencyKey,
    ),
    uniqueIndex("processing_attempts_job_number_uidx").on(
      table.jobId,
      table.attemptNumber,
    ),
    index("processing_attempts_job_started_idx").on(
      table.jobId,
      table.startedAt,
    ),
    index("processing_attempts_model_tier_idx").on(
      table.model,
      table.serviceTier,
      table.modelVariant,
    ),
    check(
      "processing_attempts_attempt_number_check",
      sql`${table.attemptNumber} > 0`,
    ),
    check(
      "processing_attempts_replay_count_check",
      sql`${table.replayCount} >= 0`,
    ),
    check(
      "processing_attempts_latency_check",
      sql`${table.totalLatencyMs} is null or ${table.totalLatencyMs} >= 0`,
    ),
    check(
      "processing_attempts_token_counts_check",
      sql`${table.inputTokens} >= 0 and ${table.cachedInputTokens} >= 0 and ${table.outputTokens} >= 0 and ${table.reasoningTokens} >= 0 and ${table.totalTokens} >= 0 and ${table.cachedInputTokens} <= ${table.inputTokens} and ${table.reasoningTokens} <= ${table.outputTokens} and ${table.totalTokens} >= ${table.inputTokens} + ${table.outputTokens}`,
    ),
    check(
      "processing_attempts_terminal_state_check",
      sql`(${table.status} = 'running' and ${table.finishedAt} is null) or (${table.status} in ('completed', 'failed') and ${table.finishedAt} is not null)`,
    ),
    check(
      "processing_attempts_failure_code_check",
      sql`${table.status} <> 'failed' or length(trim(coalesce(${table.errorCode}, ''))) > 0`,
    ),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => labelJobs.id, {
      onDelete: "cascade",
    }),
    purpose: artifactPurposeEnum("purpose").notNull(),
    panelType: labelPanelEnum("panel_type"),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '24 hours'`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("artifacts_storage_path_uidx").on(table.storagePath),
    uniqueIndex("artifacts_application_hash_panel_uidx").on(
      table.applicationId,
      table.sha256,
      table.panelType,
    ),
    index("artifacts_job_idx").on(table.jobId),
    index("artifacts_expires_idx").on(table.expiresAt),
    check(
      "artifacts_size_bytes_check",
      sql`${table.sizeBytes} between 1 and 10485760`,
    ),
    check(
      "artifacts_dimensions_check",
      sql`(${table.width} is null or ${table.width} > 0) and (${table.height} is null or ${table.height} > 0)`,
    ),
    check(
      "artifacts_panel_purpose_check",
      sql`(${table.purpose} = 'label_artwork' and ${table.panelType} is not null) or (${table.purpose} = 'application_document' and ${table.panelType} is null)`,
    ),
  ],
);

export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").references(() => labelJobs.id, {
      onDelete: "cascade",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    source: extractionSourceEnum("source").default("openai").notNull(),
    rawText: text("raw_text"),
    fields: jsonb("fields").$type<JsonObject>().default({}).notNull(),
    imageQuality: real("image_quality"),
    confidence: real("confidence"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    usage: jsonb("usage").$type<JsonObject>().default({}).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("extractions_job_uidx")
      .on(table.jobId)
      .where(sql`${table.jobId} is not null`),
    uniqueIndex("extractions_application_uidx")
      .on(table.applicationId)
      .where(sql`${table.applicationId} is not null`),
    check(
      "extractions_owner_check",
      sql`num_nonnulls(${table.jobId}, ${table.applicationId}) = 1`,
    ),
    check(
      "extractions_image_quality_check",
      sql`${table.imageQuality} is null or ${table.imageQuality} between 0 and 1`,
    ),
    check(
      "extractions_confidence_check",
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`,
    ),
    check("extractions_latency_check", sql`${table.latencyMs} >= 0`),
  ],
);

export const extractionCache = pgTable(
  "extraction_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    scopeId: text("scope_id").notNull(),
    fields: jsonb("fields").$type<JsonObject>().notNull(),
    rawText: text("raw_text"),
    imageQuality: real("image_quality"),
    confidence: real("confidence"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    serviceTier: text("service_tier").notNull(),
    usage: jsonb("usage").$type<JsonObject>().default({}).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("extraction_cache_scope_expires_idx").on(
      table.scopeId,
      table.expiresAt,
    ),
    check(
      "extraction_cache_confidence_check",
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`,
    ),
    check("extraction_cache_latency_check", sql`${table.latencyMs} >= 0`),
  ],
);

export const ruleResults = pgTable(
  "rule_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => labelJobs.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    status: ruleStatusEnum("status").notNull(),
    severity: ruleSeverityEnum("severity").notNull(),
    expectedValue: jsonb("expected_value").$type<unknown>(),
    observedValue: jsonb("observed_value").$type<unknown>(),
    confidence: real("confidence"),
    explanation: text("explanation").notNull(),
    evidence: jsonb("evidence").$type<JsonObject>().default({}).notNull(),
    sourceCitation: jsonb("source_citation")
      .$type<JsonObject>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("rule_results_job_rule_uidx").on(table.jobId, table.ruleId),
    index("rule_results_job_status_idx").on(table.jobId, table.status),
    check(
      "rule_results_confidence_check",
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`,
    ),
  ],
);

export const reviewDecisions = pgTable(
  "review_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => labelJobs.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    decision: reviewDecisionEnum("decision").notNull(),
    notes: text("notes"),
    overrides: jsonb("overrides").$type<JsonObject>().default({}).notNull(),
    reviewVersion: integer("review_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("review_decisions_job_version_uidx").on(
      table.jobId,
      table.reviewVersion,
    ),
    index("review_decisions_job_created_idx").on(table.jobId, table.createdAt),
    check("review_decisions_version_check", sql`${table.reviewVersion} > 0`),
    check(
      "review_decisions_notes_check",
      sql`${table.decision} = 'confirmed_clear' or length(trim(coalesce(${table.notes}, ''))) >= 10`,
    ),
  ],
);

export const statusEvents = pgTable(
  "status_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => labelJobs.id, { onDelete: "cascade" }),
    fromStatus: jobStatusEnum("from_status"),
    toStatus: jobStatusEnum("to_status").notNull(),
    details: jsonb("details").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("status_events_job_created_idx").on(table.jobId, table.createdAt),
  ],
);

export const queueOutbox = pgTable(
  "queue_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").references(() => labelJobs.id, {
      onDelete: "cascade",
    }),
    eventId: text("event_id").notNull(),
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull(),
    status: outboxStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("queue_outbox_event_uidx").on(table.eventId),
    uniqueIndex("queue_outbox_job_event_uidx").on(table.jobId, table.eventName),
    index("queue_outbox_dispatch_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check("queue_outbox_attempt_check", sql`${table.attemptCount} >= 0`),
  ],
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    sessionId: text("session_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    kind: text("kind").notNull(),
    units: integer("units").default(1).notNull(),
    ledgerDate: date("ledger_date", { mode: "string" })
      .default(sql`current_date`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("usage_ledger_session_date_idx").on(
      table.sessionId,
      table.ledgerDate,
      table.kind,
    ),
    index("usage_ledger_ip_date_idx").on(
      table.ipHash,
      table.ledgerDate,
      table.kind,
    ),
    index("usage_ledger_global_date_idx").on(table.ledgerDate, table.kind),
    check("usage_ledger_units_check", sql`${table.units} > 0`),
  ],
);

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type LabelJob = typeof labelJobs.$inferSelect;
export type NewLabelJob = typeof labelJobs.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Extraction = typeof extractions.$inferSelect;
export type RuleResultRecord = typeof ruleResults.$inferSelect;
export type ReviewDecisionRecord = typeof reviewDecisions.$inferSelect;
export type StatusEventRecord = typeof statusEvents.$inferSelect;
export type QueueOutboxRecord = typeof queueOutbox.$inferSelect;
export type ProcessingAttempt = typeof processingAttempts.$inferSelect;
export type NewProcessingAttempt = typeof processingAttempts.$inferInsert;
