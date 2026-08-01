# ProofCheck verification report

Verification date: August 1, 2026

Ruleset: `2026-07-31.1`

Runtime: Node.js 20, Next.js 16.2.12

## Automated results

| Gate                                    | Result                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Locked dependency install               | Pass from a clean temporary clone; 679 packages installed, audit 0 vulnerabilities          |
| Formatting, ESLint, TypeScript          | Pass                                                                                        |
| Clean migration, repeat migration, seed | Pass                                                                                        |
| Database/private Storage check          | Pass                                                                                        |
| Unit/component/business suite           | 24 files, 239 tests passed; one live paid-provider bake-off file skipped by default         |
| Coverage                                | 96.76% statements, 90.93% branches, 98.78% functions, 97.16% lines                          |
| Compliance/matching coverage            | 98.88% / 98.94% statements; 95.13% / 97.46% branches                                        |
| Real database integration               | 6 scenarios passed                                                                          |
| Public Playwright regression            | 26 passed, 22 release-only/single-project cases intentionally skipped across four viewports |
| axe-core browser suite                  | 12 passed; zero serious/critical findings                                                   |
| Production build                        | Pass; all expected application and API routes emitted                                       |
| Production-like start/health            | Pass; `/api/health` returned `ready` with database, OpenAI, Inngest, and Storage configured |
| Production dependency audit             | 0 vulnerabilities                                                                           |
| Full dependency audit                   | 0 vulnerabilities                                                                           |
| Secret scan                             | Pass across 175 source files, 30 client bundle files, and Git history                       |

`npm ci` emitted deprecation notices from the latest published `drizzle-kit` loader and Inngest/telemetry transitive packages (`serialize-error-cjs`, `node-domexception`). Their dependency paths and current upstream versions were inspected; neither has a newer compatible parent release at verification time, both audits remain at zero vulnerabilities, and application runtime behavior is covered above.

Commands executed:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run db:migrate
npm run db:migrate
npm run db:seed
npm run test:db
npm run test:integration
npm run build
npm run start
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:a11y
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run check:secrets
```

## Real-browser workflows verified

- Opened the workspace with no onboarding or sign-in and understood the primary actions.
- Navigated by visible links, refreshed pages, and directly opened nested review/batch URLs.
- Submitted invalid manual data by keyboard, observed accessible field/summary errors, and confirmed entered values remained intact.
- Opened manual, application-document, and CSV batch modes and verified their input/recovery guidance.
- Ran a live compliant-bourbon example through Next.js, transactional persistence/outbox, local Inngest, real OpenAI vision, deterministic evaluation, and the evidence review screen.
- Uploaded a real text application to private Supabase Storage, waited for real OpenAI document extraction, edited/confirmed the draft, uploaded artwork through a signed private target, and processed the label to conservative human review.
- Verified the unscaled custom artwork reports warning minimum type size as `Not assessed` rather than inventing a pass.
- Launched the cached-extraction 250-item benchmark through the real durable queue. It completed 250 unique jobs in 1 minute 47 seconds: 125 pre-check passed, 41 human review, and 84 correction needed, with no missing/duplicate jobs.
- Observed partial batch progress after reload; filtered, searched, sorted, opened an item, and exported results.
- Created a browser-backed draft, confirmed a second anonymous session received `Batch unavailable`, then verified cancel/delete choices and the explicit irreversible deletion confirmation.
- Selected a human override on a live low-quality case, triggered the required-rationale validation, recorded a valid rationale, reloaded the nested review URL, and confirmed the immutable decision/note remained in history.
- Monitored page errors, error-level console messages, HTTP 5xx responses, visible status, and persisted backend state throughout the browser suite. No unexplained issue remained.

Viewports exercised with the real UI:

- 390 × 844 mobile
- 768 × 1024 tablet
- 1440 × 900 desktop
- 1920 × 1080 wide desktop

Keyboard focus/submit behavior, responsive overflow, long form content, duplicate interaction, live regions, reduced-motion styling, and primary navigation were included in focused automated/manual review.

## External integrations

- **OpenAI:** real structured image extraction and real application-document extraction succeeded with `store: false`; malformed output/refusal, timeout, 4xx, delivery failure, and retry behavior have mocked regression coverage.
- **Supabase Postgres:** migrations, constraints, transaction rollback, atomic quota race handling, cross-session authorization, immutable decisions, cancellation/retry, status history, outbox targeting, and cleanup behavior were exercised.
- **Supabase Storage:** the bucket is private; signed upload, object verification, signed read, and cleanup behavior succeeded.
- **Inngest:** local function registration, one-event-per-job fan-out, cached benchmark stress, live worker execution, replay checkpoints, target-aware delivery, and scheduled outbox/expiry functions were exercised. The production `proofcheck` app synced successfully in Inngest Cloud with the stable Vercel endpoint and all verification, document, recovery, cleanup, and generated failure handlers.
- **Vercel:** the public deployment reports healthy database/OpenAI/Inngest/Storage readiness, current build identity, expected security headers, and successful static asset/download delivery.

## Performance evidence

The optimized public workflow performed twenty sequential live-model scans using unique normalized image variants. All twenty reached persisted `completed` status without prompt-cache input reads.

- Warm API acknowledgement median: 150 ms; p95: 314 ms
- Submission-to-persisted terminal median: 3,976 ms
- Browser-observed completion median: **4,428 ms**; p95: **7,124 ms**
- OpenAI provider median: 2,808 ms
- Non-provider worker median: 101 ms; p95: 220 ms
- Ten warmed exact repeats: 953 ms median; 984 ms p95 with visible cache provenance

The primary five-second median and eight-second p95 gates pass. The free Inngest HTTP queue remains above its aspirational 300 ms sub-budget (523 ms median and 640 ms p95 on warmed repeat work), but it does not prevent the user-facing KPI from passing. Detailed spans, finalists, rejected experiments, cold/fallback separation, and the remaining external floor are in `PERFORMANCE_REPORT.md`.

## Defects discovered and fixed

- Invalid environment-level Inngest concurrency configuration.
- Worker replay conflict against a partial extraction index.
- False ABV-format failure caused by a numeric-only demo transcription.
- One artifact update per job in a 250-item transaction.
- Low-quality unreadable evidence incorrectly producing a confident correction outcome.
- OpenAI application and PDF-artwork inputs serialized as bare base64 rather than MIME-qualified data URIs.
- Permanent provider 4xx errors retrying while the document UI remained in extraction state.
- A test incorrectly expecting physical warning size to pass from an unscaled photograph.
- Interactive outbox targets accepted by the dispatcher but ignored by its database claim.
- Application extraction events sitting behind unrelated job work because they lack job IDs.
- Empty retry targets potentially turning into an unrelated global outbox sweep.
- A Vercel canonical origin configured before the platform assigned its stable alias.
- Vercel database health failing because the Supabase direct endpoint is IPv6-only; production now uses the verified IPv4 Supavisor transaction pooler.
- The release-only cloud batch readiness window ending seconds before a healthy free-tier drain; the deterministic window now reflects measured cloud concurrency.
- A compact array provider schema emitting duplicate or semantically incorrect field keys; replaced by a profile-aware fixed object schema.
- Compact numeric evidence dropping exact ABV source wording and causing deterministic format false failures.
- Interactive queue serialization behind Inngest durable-step finalization; removed while bulk remains capped at four.
- A direct-send queue experiment that worsened p95; removed rather than left as dormant complexity.
- Pre-release migration `0001` checksum drift after repository whitespace normalization; repaired with an exact known-checksum reconciliation while preserving hard failure for every unknown change.

Every substantive defect above has focused regression coverage or an integration/browser reproduction recorded in `PLAN.md`.

## Release result

Public prototype: [https://treasury-label-verifier-dusky.vercel.app](https://treasury-label-verifier-dusky.vercel.app)

Source repository: [https://github.com/ilan0/treasury-label-verifier](https://github.com/ilan0/treasury-label-verifier)

- Production `/api/health` returned HTTP 200 `ready`; database, OpenAI, Inngest, and private Storage checks were all true. The endpoint exposed the current Git release identity and all expected security headers.
- A final clean public-browser regression ran 48 scenarios across the four release viewports: 26 passed and 22 live-cost/single-project scenarios were intentionally gated. The dedicated public axe run passed 12/12 with zero serious or critical findings.
- Twenty clean-session public live scans using unseen image variants measured 4.428 seconds median and 7.124 seconds p95 through Inngest Cloud and real OpenAI.
- The final public application-document/private-artwork workflow passed in 12.4 seconds using real GPT-5.4 mini extraction and conservative human review.
- The public live human-review/immutable-history workflow passed in 20.0 seconds.
- The final production benchmark created exactly 250 unique jobs and reached 250 terminal outcomes in 3.3 minutes under the free five-concurrency pool: 125 passed, 41 human review, and 84 correction. An interactive queued result completed in 2.0 seconds during that load. Final progress, outcome cards, filtering, search, and CSV export passed with no console/page/5xx failure.
- The README setup was executed from a clean temporary clone: `npm ci`, migration, seed, private-bucket/database check, formatting, lint, types, all 239 normal tests, and a production build passed.

The only remaining performance limitation is the explicitly measured Inngest queue sub-budget above; no unresolved critical/high correctness, security, accessibility, or release issue remains.
