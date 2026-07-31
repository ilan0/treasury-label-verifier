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
- [ ] 11. Documentation, deployment, and public release verification

## Release gates

- [x] Lockfile install, format, lint, and type check
- [x] Clean migration, repeat migration, seed, and database check
- [x] Unit, integration, database, accessibility, and end-to-end tests
- [x] Production build and production-like startup
- [ ] Real OpenAI, Supabase, Inngest, and public Vercel smoke checks
- [x] Desktop, tablet, mobile, keyboard, console, and network browser review
- [x] Dependency audit and tracked/build-output secret scan
- [ ] README fresh-clone verification and final TEST_REPORT.md

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

## Measured performance

- Ten warm, live compliant-bourbon runs all reached persisted `completed` status.
- Queue/API acknowledgement median: 2,721 ms; p95: 3,562 ms against hosted Supabase from the local test environment.
- End-to-end completion median: 13,778 ms; p95: 19,823 ms.
- Recorded model-call latency ranged from 4,627–12,008 ms with an approximately 6.1 second median for those runs.
- The external-service combination therefore does not consistently meet the aspirational five-second total. The UI remains non-blocking, exposes durable progress immediately, and survives reload/deploy/retry; the limitation will be stated in the release report rather than obscured.
