# ProofCheck performance execution record

This is the living experiment ledger for the approved five-second latency program.

## Acceptance targets

- Warm unique-image click-to-visible median: at most 5,000 ms
- Warm unique-image click-to-visible p95: at most 8,000 ms
- Submission acknowledgement p95: at most 500 ms
- Queue overhead p95: at most 300 ms
- Non-provider worker median: at most 1,000 ms
- Exact repeat/cache p95: at most 1,000 ms with disclosed provenance
- Zero false pre-check passes for mandatory-defect vectors
- At least 98% critical-field extraction accuracy
- 100% exact health-warning mutation detection

## Baseline evidence

- Ten repeated warm demo runs: 13,778 ms median and 19,823 ms p95 end to end.
- Representative production Inngest run: 9,187 ms total; 115 ms Inngest overhead, 8,770 ms processor, and 125 ms finalization.
- The representative provider call used GPT-5.6 Luna and took 4,255 ms.
- It consumed 4,022 input tokens, 757 output tokens, and reported 3,757 cached input tokens.
- Persisted job processing was 7,250 ms, leaving approximately 2,995 ms beyond provider inference.
- Baseline Vercel functions executed in `iad1`; the Supabase project is in AWS `us-west-2`.

The repeated-image baseline is not accepted as an unseen-image benchmark because it benefits from exact input caching.

## Experiment protocol

1. Attribute request, commit, event delivery, worker invocation, context load, artifact preparation, provider, persistence, and browser-observation spans.
2. Change one major variable at a time and record median, p75, p95, range, tokens, cost, accuracy, and failures.
3. Screen provider variants with three calls, advance finalists to ten, and run the winner at least twenty times on unique image variants.
4. Reject any experiment that causes a mandatory false pass or violates conservative human-review routing.
5. Remove losing feature branches/configuration rather than accumulating dormant complexity.

## Milestones

- [x] Span-level attempt instrumentation and unique-image benchmark
- [x] Vercel/database regional/runtime optimization
- [x] Submission and worker database critical-path collapse
- [x] Pre-normalized artwork and transport/detail bake-off
- [x] Model, schema, prompt, output-token, caching, and service-tier bake-off
- [x] Adaptive fast/fallback routing and content-addressed cache
- [x] Interactive queue reservation and browser observation optimization
- [x] Correctness corpus, performance reruns, public release, and final report

## Experiment ledger

| Experiment        | Variant                                                             | Result                                                                                                          | Decision                                        |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Baseline topology | `iad1` + Oregon Supabase                                            | Processor 8,770 ms on representative production run                                                             | Replace only after measured regional comparison |
| Baseline provider | GPT-5.6 Luna, high detail, verbose schema                           | 4,255 ms; 757 output tokens                                                                                     | Optimize schema/image and compare models        |
| Runtime topology  | Fluid Compute in `pdx1` + Oregon Supabase                           | Non-provider worker median 101 ms, p95 220 ms                                                                   | Retain                                          |
| Image transport   | Worker fetch + MozJPEG                                              | Representative local preprocessing about 72 ms                                                                  | Replace                                         |
| Image transport   | Normalized static JPEG + public URL                                 | Production preprocessing 0–1 ms                                                                                 | Retain for built-in examples                    |
| Provider/schema   | GPT-5.4 mini + fixed compact object                                 | Provider median 2,808 ms; about 328–345 output tokens; complete critical evidence                               | Retain as fast path                             |
| Provider/schema   | Nano, 4o mini, Terra, Sol variants                                  | Faster configurations omitted or hallucinated critical evidence; accurate Sol priority remained slower/costlier | Reject                                          |
| Thorough fallback | GPT-5.6 Luna + original detail                                      | Conservative rich evidence for poor/incomplete scans                                                            | Retain as fallback only                         |
| Queue flow        | Separate interactive function with concurrency one                  | Repeat p95 5,119 ms due durable-step finalization serialization                                                 | Remove serialization                            |
| Cache path        | Versioned content-addressed extraction + deterministic reevaluation | Repeat median 953 ms, p95 984 ms                                                                                | Retain                                          |
| Dispatch          | Direct send without outbox claim                                    | Repeat p95 regressed to 2,649 ms                                                                                | Remove                                          |
| Final unique KPI  | 20 unseen normalized rasters                                        | Visible median 4,428 ms, p95 7,124 ms; persisted median 3,976 ms                                                | Pass                                            |
