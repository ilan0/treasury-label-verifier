# ProofCheck implementation plan

This file is the living execution record for the approved implementation plan.

## Milestones

- [x] 1. Engineering foundation, repeatable commands, CI, and dependency hygiene
- [x] 2. Versioned TTB compliance rules and deterministic test vectors
- [x] 3. Database migrations, private storage, retention, and anonymous authorization
- [x] 4. Secure manual, document, upload, and CSV intake
- [x] 5. Durable Inngest pipeline and structured OpenAI extraction
- [x] 6. Deterministic matching, confidence routing, and human decisions
- [x] 7. Responsive user-first UI and built-in demonstrations
- [x] 8. Required 200–300-item batch workflow
- [x] 9. Security, abuse controls, resilience, accessibility, and performance
- [x] 10. Automated and real-browser QA loop
- [x] 11. Documentation, deployment, and public release verification
- [x] 12. Five-second latency program, accuracy regression, and production rollout

## Release gates

- [x] Lockfile install, format, lint, and type check
- [x] Clean migration, repeat migration, seed, and database check
- [x] Unit, integration, database, accessibility, and end-to-end tests
- [x] Production build and production-like startup
- [x] Real OpenAI, Supabase, Inngest, and public Vercel smoke checks
- [x] Desktop, tablet, mobile, keyboard, console, and network browser review
- [x] Dependency audit and tracked/build-output secret scan
- [x] README fresh-clone verification and final TEST_REPORT.md
- [x] Twenty-variant unseen-image and ten-run exact-repeat performance gates

## Defect log

Defects discovered during implementation and QA are added here and closed only after regression verification.

- [x] Inngest rejected environment-scoped concurrency without a key; replaced with function-scoped limits and confirmed successful registration.
- [x] Partial unique extraction index could not be inferred by a targeted `ON CONFLICT`; changed replay checkpoint inserts to conflict-safe untargeted handling and verified a retry reached a terminal result.
- [x] Compliant demo used numeric-only alcohol raw text and produced a false statement-format failure; fixtures now include authorized `Alc./Vol.` wording and a queued browser run pre-checks successfully.
- [x] A 250-item submission issued one artifact update per job inside its transaction; replaced with one set-based update. The first benchmark completed all 250 jobs with no missing or duplicate rows.
- [x] Poor/unreadable evidence could produce a confident correction request for text the system could not actually read; low-quality apparent failures now route to human review, with regression coverage.
- [x] OpenAI rejected application documents because the worker sent bare base64 instead of a MIME-qualified data URI; fixed serialization, added regression coverage, and verified private upload registration separately.
- [x] PDF label artwork used the same unsafe bare-base64 serialization path; preserved the MIME-qualified data URI and added provider regressions for valid output, malformed/refused output, timeout propagation, and both file-input variants.
- [x] Permanent application-provider 4xx errors consumed retries while the UI remained in extraction state; they now fail immediately with a recoverable manual-entry message.
- [x] The live custom-upload test expected a legal-format pass from an unscaled image; corrected the regression to require human review because physical warning type size cannot be proven without scale metadata.
- [x] Interactive submissions passed target job IDs to the dispatcher but the database claim ignored them; claims are now target-aware while scheduled recovery remains global, with delivery-failure regression coverage.
- [x] Application-document events have no job ID and could still sit behind unrelated outbox work; the dispatcher now supports validated event-ID targeting and document intake uses it.
- [x] Retrying a batch with zero failed jobs could pass an empty target and accidentally sweep unrelated outbox work; explicit empty targets now return without claiming globally.
- [x] The production 250-item free-tier drain completed just after the browser's five-minute readiness window; the release-only deterministic condition now allows six minutes, and the original completed batch was reopened under its signed session to verify final UI, filtering, search, and CSV export without creating duplicate work.
- [x] Vercel assigned a different stable alias than the preconfigured canonical origin; updated `NEXT_PUBLIC_APP_URL` and redeployed before live worker smoke testing.
- [x] Production health exposed an IPv6-only Supabase direct database endpoint; verified the project's exact IPv4 Supavisor transaction pooler, replaced only Vercel's server `DATABASE_URL`, redeployed, and confirmed public health `ready`.
- [x] A universal compact array schema was fast but semantically unsafe: smaller models emitted duplicate or incorrect field keys. Replaced it with a fixed, profile-aware object schema and golden conversion tests.
- [x] Numeric-only compact ABV evidence caused statement-format false failures. Compact numeric evidence now preserves exact source wording for deterministic format checks.
- [x] Compact extraction could not prove subjective warning presentation from an unscaled custom photograph. Those facts are deliberately omitted and route to review; only verified built-in artwork receives trusted physical/presentation metadata.
- [x] Interactive `concurrency: 1` serialized a new run behind Inngest's post-terminal durable-step finalization, producing alternating multi-second cache results. Removed only interactive serialization while retaining bulk concurrency four; repeat p95 is now 984 ms.
- [x] Direct post-commit event delivery without first claiming the outbox was tested as a queue optimization and regressed repeat p95 to 2,649 ms. Removed the losing experiment and retained the proven targeted transactional outbox path.
- [x] Fresh-clone migration verification found that telemetry migration `0001` had been applied before its final whitespace-only repository normalization. Added an exact, one-directional checksum reconciliation for that known pre-release pair; every unknown migration drift remains a hard failure.

## Measured performance

- Twenty unique, unseen live compliant-bourbon rasters all reached persisted `completed` status.
- Warm submission acknowledgement median: 150 ms; p95: 314 ms. Documented post-deployment cold acknowledgements were 740 and 942 ms.
- Submission-to-persisted terminal median: 3,976 ms; click-to-visible median: 4,428 ms and p95: 7,124 ms.
- Provider median: 2,808 ms. Non-provider worker median: 101 ms and p95: 220 ms.
- Ten warmed exact repeats returned with disclosed cache provenance in 953 ms median and 984 ms p95.
- The primary five-second median and eight-second p95 pass. The remaining externally imposed sub-budget limitation is the free Inngest HTTP control plane: warmed repeat queue median 523 ms and p95 640 ms rather than the aspirational 300 ms. Full spans and rejected experiments are in `PERFORMANCE_REPORT.md`.
