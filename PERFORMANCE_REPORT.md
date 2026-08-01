# ProofCheck performance report

Verification date: August 1, 2026

Primary path: warm, previously unseen, normalized single-label raster with a confirmed manual application. Every measured scan used the production Next.js application, transactional outbox, Inngest Cloud, OpenAI vision, Supabase persistence, deterministic rules, and browser polling. Cached results are reported separately.

## Final production result

| Measurement                                          |       Median |      p75 |          p95 |         Min–max |
| ---------------------------------------------------- | -----------: | -------: | -----------: | --------------: |
| Click to visible terminal result, 20 unseen variants | **4,428 ms** | 5,355 ms | **7,124 ms** | 3,289–11,080 ms |
| Submission to persisted terminal                     | **3,976 ms** | 4,770 ms |     6,437 ms | 2,925–10,559 ms |
| Worker total                                         |     3,028 ms | 3,630 ms |     5,678 ms |  2,392–9,844 ms |
| OpenAI provider                                      |     2,808 ms | 3,536 ms |     5,543 ms |  2,289–9,697 ms |
| Non-provider worker work                             |   **101 ms** |   130 ms |   **220 ms** |       78–243 ms |
| Queue/control plane                                  |       768 ms |   901 ms |     1,820 ms |    533–2,764 ms |

The primary five-second median and eight-second p95 gates pass. One OpenAI outlier reached 9.7 seconds, but the nearest-rank p95 across the required twenty unique variants remained 7.124 seconds. All twenty jobs reached `completed`; none was rejected, corrected, or routed to review.

Two first requests immediately following separate production deployments were classified as cold submissions. Their acknowledgement times were 740 and 942 ms. After excluding those documented cold starts, warm submission acknowledgement was 150 ms median and 314 ms p95. The all-run acknowledgement distribution was 152 ms median and 740 ms p95.

## Exact-repeat result

After one unmeasured warm-up, ten exact repeats produced:

| Measurement                             |     Median |        p95 |
| --------------------------------------- | ---------: | ---------: |
| Click to visible cached terminal result | **953 ms** | **984 ms** |
| Submission acknowledgement              |     148 ms |     159 ms |
| Cached worker execution                 |      89 ms |     127 ms |
| Queue/control plane                     |     523 ms |     640 ms |

The review screen identifies the result as a versioned cached extraction. Deterministic rules execute again; only model extraction is reused. Custom cache entries are scoped to the signed user session, while disclosed built-in examples may be reused globally.

## Accuracy floor

- The twenty unseen performance rasters yielded 100% correct critical evidence across brand, class/type, ABV, proof, volume, responsible-party name/address/role, and exact warning transcription. Every associated mandatory deterministic rule passed.
- A sixty-label deterministic corpus covers compliant spirits, punctuation/casing equivalence, a warning defect, imported-origin mismatch, conditional malt ABV, and poor/glare-obscured evidence. It has zero false pre-check passes.
- Fourteen independent statutory-warning text mutations plus missing text are rejected. Line wrapping and repeated whitespace remain the only accepted normalization. Warning defect detection is 100% for this corpus.
- Compact extraction intentionally does not invent warning boldness, contrast, separation, legibility, or physical type size for custom photographs. Missing visual evidence routes to human review; difficult or incomplete transcription invokes the thorough fallback.

This controlled corpus is an engineering regression set, not a statistically calibrated legal-validation dataset.

## Span attribution

`processing_attempts` stores the model, observed service tier, extraction strategy, prompt version, tokens, replay count, and queue, validation/context, preprocessing/artifact, provider, verification, persistence, and total spans. Review APIs expose only sanitized provenance and timings.

On the twenty-run final:

- Context/validation was generally 19–60 ms, with cold maxima of 123 ms.
- Public-URL image transport reduced worker preprocessing to 0–1 ms.
- Verification was generally 0–5 ms; the maximum was 12 ms.
- Final persistence was 35–83 ms.
- Provider output used approximately 328–345 tokens, down from the 757-token baseline.
- Each final call used 3,097 input tokens and reported no repeated-image cached input tokens, confirming the unique-image KPI was not a prompt-cache benchmark.

## Experiments and decisions

| Avenue                                            | Evidence                                                                                   | Decision                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `iad1` application / Oregon database baseline     | Representative worker 8.77 s with about 3.0 s beyond inference                             | Replaced                                                  |
| `pdx1` Fluid application / Oregon database        | Final non-provider median 101 ms; database-bearing validation/persistence spans remain low | **Retained**                                              |
| Repeated worker status/context reloads            | Approximately 3 s recoverable baseline overhead                                            | Replaced with atomic claim/load and one final transaction |
| Worker MozJPEG normalization                      | Local representative conversion about 72 ms                                                | Replaced; non-MozJPEG path about 7.5 ms locally           |
| Public demo URL transport                         | Production preprocessing 0–1 ms                                                            | **Retained for built-in rasters**                         |
| Universal array wire schema                       | Fast but produced duplicate/wrong semantic field keys                                      | Rejected for correctness                                  |
| Profile-aware fixed compact schema                | Exact evidence preserved in about 328–345 output tokens                                    | **Retained**                                              |
| GPT-5.6 Terra                                     | Approximately 2.5–3.3 s screening, but hallucinated a critical brand spelling              | Rejected                                                  |
| GPT-5.4 nano                                      | Omitted critical label fields                                                              | Rejected                                                  |
| GPT-4o mini                                       | Omitted critical fields and used materially larger image input                             | Rejected                                                  |
| GPT-5.6 Sol default                               | Slower and had a screening outlier                                                         | Rejected                                                  |
| GPT-5.6 Sol priority/Fast experiment              | Accurate screening around 2.6–3.7 s, but slower and more expensive than the finalist       | Rejected                                                  |
| GPT-5.4 mini, default tier                        | Twenty-run provider median 2.808 s with complete evidence                                  | **Retained for the compact fast path**                    |
| GPT-5.6 Luna thorough path                        | Higher latency but conservative, rich fallback evidence                                    | **Retained only as fallback/rollback**                    |
| Interactive function `concurrency: 1`             | Alternating repeat results; 1.449 s median and 5.119 s p95                                 | Removed                                                   |
| Bulk concurrency four, interactive queue separate | Leaves the free account's fifth execution slot available to interactive work               | **Retained**                                              |
| Direct send before outbox claim                   | Follow-up repeat p95 regressed to 2.649 s                                                  | Removed; targeted transactional outbox dispatch retained  |
| SSE/realtime infrastructure                       | Polling observation is at most about 250 ms on the benchmark path and total KPI passes     | Rejected as unnecessary complexity                        |
| Local OCR / hedged duplicate calls                | Model path meets the KPI; both add deployment/cost or correctness risk                     | Not activated                                             |

## Remaining external floor

The free Inngest HTTP control plane did not meet the aspirational 300 ms p95 queue sub-budget. After removing local serialization, targeted dispatch still measured 523 ms median and 640 ms p95 on warmed repeat work (the unmeasured post-deploy warm-up was 1,032 ms); direct-send experimentation did not improve the end-to-end distribution. Inngest Connect would require a continuously running container rather than the requested Vercel prototype and was not introduced solely to optimize a sub-span after the public end-to-end KPI passed.

OpenAI tail latency is externally variable. The application therefore preserves the durable asynchronous design, conservative fallback, progress restoration, retries, and human-review boundaries rather than masking those tails.

## Reproduce

```bash
PLAYWRIGHT_BASE_URL=https://treasury-label-verifier-dusky.vercel.app \
  BENCHMARK_RUNS=10 BENCHMARK_VARIANTS=unique \
  BENCHMARK_WARMUP_RUNS=1 npm run benchmark:demo

PLAYWRIGHT_BASE_URL=https://treasury-label-verifier-dusky.vercel.app \
  BENCHMARK_RUNS=10 BENCHMARK_VARIANTS=repeat \
  BENCHMARK_WARMUP_RUNS=1 npm run benchmark:demo
```

Unique mode requires unused generated performance variants and a configured live-analysis allowance. Repeated mode deliberately exercises content-addressed extraction reuse. Full release commands and browser evidence are recorded in `TEST_REPORT.md`.
