# AP4 — Receipt qualification

Scope: K1–K4 from [the project audit](2026-10-20-project-audit.md), on top of AP1–AP3
(`166d51a`). This record distinguishes implementation verification from provider and physical-device
qualification. The historical audit is not rewritten as if those measurements had already happened.

## Implementation plan

1. Align the shipped merchant examples with the strict parser; retain the exact extracted name.
   Specify conservative grouping, deposit, discount, return, and unsupported-item behavior in the
   versioned receipt prompts. Exercise actual prompt examples through actual parsers.
2. In `features/receipt`, validate locally knowable setup before remote work. The Add route owns UI
   invocation; the account-scoped configuration remains in AppShell. Preserve opaque custom rules.
   Suspend preparation during transient options loading; session replacement still cancels the run.
3. Retain automatic saving and the common AP1 commit/reconciliation owner. Add localized duplicate
   guidance and a post-save summary with the supported desktop correction path. Do not add a new
   review screen, schema, persistent receipt identity, or automatic retry of model calls.
4. Add independently inspectable synthetic receipt images, expected extraction and grouping data,
   and an offline evaluator for recorded model-pair responses. Add setup, lifecycle, rate-limit,
   image-normalization, and browser regressions. Document genuine hardware/provider gaps.
5. Run focused and full relevant checks, review the source independently, run the external
   `agy-review` in an isolated snapshot, fix accepted findings, and create a local scoped commit.

## Decisions and acceptance evidence

| Question                       | Decision                                                                                                                                                                                                                                         | Verification                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1 merchant identity           | Copy `storeName` exactly, including suffix and case. No second normalized name.                                                                                                                                                                  | All merchant examples extracted from the shipped prompt run through both real parsers; shortened names fail.                                                                   |
| K2 foreground refresh          | AP3 reuses the unchanged runtime. Transient options loading suspends preparation, including analysis completion during loading; terminal errors still discard it.                                                                                | Preparation tests cover early/late source selection and reset/error; browser test holds both analysis and freshness independently.                                             |
| Account setup                  | Require exactly one primary spendings account and at least one valid source before capture/handoff.                                                                                                                                              | Setup unit tests and no-provider-call browser regressions. Source selection and commit-time validation remain deliberate/current.                                              |
| Categories                     | With default rules, all five exact category names must each exist once. This intentionally requires complete default setup even if one receipt would use a subset. Custom rules stay opaque; their category resolution remains after derivation. | Default metadata checked against shipped rule brackets; missing/ambiguous categories rejected before normalization/catalog/completions. No category table is sent remotely.    |
| Unsupported/ambiguous goods    | Reject the entire result; no invented remainder group or plausible guess. No default support for clothing, electronics or pharmacy.                                                                                                              | Synthetic unsupported/ambiguous gold cases plus evaluator tests. Actual model compliance is still unqualified.                                                                 |
| Deposits                       | Default grocery deposits/returns go to normal food, including deposits on sweet drinks. Restaurant rule takes precedence over all grocery rules.                                                                                                 | Mixed basket, deposit-return, restaurant gold cases.                                                                                                                           |
| Discounts/returns              | Assign only to the identifiable affected group. Each final group and the receipt total must be positive. Reject pure refunds, zero totals and nonpositive groups.                                                                                | Real parser arithmetic checks and positive/negative corpus cases; no cross-group reassignment to hide a negative group.                                                        |
| Auto-save                      | Retained after deliberate source selection. No review/edit screen. Show saved date, merchant, title, amount, source and categories after remote acceptance.                                                                                      | Browser success and retry tests; summary is transient UI state, cleared with the route.                                                                                        |
| Correction                     | Inspect the summary and Transfers. Close Mobile, correct in Desktop, reopen/refresh Mobile; never use both concurrently.                                                                                                                         | Localized visible summary instructions and browser assertion. No claim of mobile edit/delete functionality.                                                                    |
| Duplicate suspicion            | No reliable cross-run detector is introduced. Equal date/merchant/total can be legitimate; no schema change or persistent image/fingerprint. A visible pre-capture warning requires checking existing transfers before another photo.            | Browser warning assertion; repeated-photo duplicates remain a disclosed risk. This is guidance, not duplicate prevention.                                                      |
| Unknown upload outcome         | Retain AP1's original eTag/bytes, explicit unknown-outcome message and remote comparison/reconciliation. Never automatically start a new photo/book again.                                                                                       | Existing receipt upload/recovery and write-safety tests. Identical bytes can prove success; intervening changes do not prove a lost upload failed.                             |
| Reuse after analysis error     | Retain fresh-photo policy. No retry of retained extraction/derivation and no image persistence. Upload retry remains the separate AP1 byte-only operation.                                                                                       | Existing model-error/fresh-selection, route abandonment, disposal and byte-retry regressions.                                                                                  |
| Rate limits/model availability | Recheck live eligibility before each stage; catalog HTTP 429 now reaches the same localized rate-limit recovery as completion HTTP 429. No hardcoded quotas, fallback model, or automatic retry.                                                 | Controller test plus browser catalog 429 at either stage; existing completion error tests.                                                                                     |
| HEIC/orientation               | Browser-native decoding with applied orientation; fallback releases object URLs. Unsupported HEIC offers JPEG/new capture guidance. No added converter or blanket HEIC support claim.                                                            | Codec orientation/fallback/disposal unit tests; native HEIC and EXIF photographs remain physical-device cases.                                                                 |
| Large photos/memory            | Retain 20 MiB source, 2560-pixel long edge and 4 MiB encoded output. These do **not** bound peak decoder memory; do not invent an unsupported memory threshold.                                                                                  | Existing limits/resource-cleanup tests. Desktop browser normalization is not a peak-memory measurement on a phone. A 48 MP raster alone may need about 192 MB (4 bytes/pixel). |
| Long receipts                  | Preserve whole-receipt arithmetic/coverage; no automatic segmentation or cropping. Long-edge scaling can destroy legibility, so rejection is acceptable; correct OCR is not established by a successful resize.                                  | Long synthetic SVG exercises real browser JPEG normalization and corpus coverage. Real long-photo OCR remains open.                                                            |

## Corpus and model evaluation

[`tests/fixtures/receipts`](../../tests/fixtures/receipts/README.md) contains 13 entirely synthetic,
non-personal receipt images and separate expected data. Six have positive supported groupings;
seven require a safe rejection. The evaluator checks exact OCR fields and item data as well as
line-to-category assignments and cent totals. A changed transfer summary title alone is acceptable.
It detects plausible, arithmetically consistent wrong dates and wrong categories that the runtime
parser cannot detect from model output alone.

Gold replay checks the evaluator and contracts. It is **not** a measured OCR or classification success
rate. The normal suite skips the optional recorded-provider evaluation when no run file is supplied.
No real provider/model-pair results, latencies or physical-device passes have been obtained here.

For each real model pair, record all cases with model IDs, prompt/rule versions, source revision,
timestamp, raw parsed JSON responses and end-to-end latency. Use synthetic images first; add reviewed
anonymized photographs separately, preserving independent gold review. Report correct results,
unsafe acceptances, safe rejections, false rejections and latency. Any unsafe acceptance or false
rejection fails the complete-corpus evaluation; a small passing corpus still does not prove general
production quality. Provider failures must be recorded separately from model-declared rejection.

## Physical/provider qualification still open

Use [the device QA procedure](../Manual-Device-QA.md) with a disposable database and the exact
candidate identity. Extend receipt evidence with device/OS/browser, installed versus browser mode,
model pair, prompt versions, normalized dimensions, outcome and elapsed time. Never include API keys,
private databases or identifiable photos in public evidence.

| Required case                                                                         | Current evidence                                  | Outstanding evidence                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| iPhone and Android camera return, app switch, display lock during each analysis stage | Mocked foreground browser regression              | Physical native-picker lifecycle in browser and installed PWA                 |
| Orientation including EXIF rotation, HEIC                                             | Codec contracts and fallback tests                | Actual JPEG/HEIC camera samples on both platforms                             |
| Large 12/48 MP photos and memory pressure                                             | Encoded byte/dimension/resource-release contracts | Peak memory, process survival and usable recovery on physical devices         |
| Long narrow receipts, blur, reflection and unreadable print                           | Synthetic long/invalid cases                      | Independent photographed gold corpus and true provider outcomes               |
| Auto-save summary, correction and repeated photo                                      | Browser summary/warning/recovery                  | Physical user workflow and desktop correction round-trip                      |
| Every configured free model pair, unavailable model and capacity limits               | Mocked eligibility/429/error contracts            | Timestamped real model-pair corpus report, provider failure rates and latency |

AP4's code and decisions can be reviewed independently. **Full provider/device qualification remains
open; this record grants no production release approval.**

## Verification and review

Results are recorded here after execution. Generated logs/reports stay outside the commit.

- `npm run check:local`: passed formatting, lint, strict type checks, dead-code analysis, 718 app
  tests, 128 script tests, production build and JS/CSS budgets. Two app cases are intentionally
  conditional: the AP3 measurement and the recorded-provider evaluation without an input file.
- The optional evaluator was additionally exercised with explicitly synthetic `gold-replay` input:
  16 tests passed, report output contained six correct cases and seven safe rejections, no unsafe
  acceptance or false rejection. Its zero latency is artificial and is not a provider measurement.
- Full three-project browser run: **299 passed, 3 skipped, 1 failed**. Chromium and Pixel passed
  completely. iPhone WebKit failed at `app-shell.spec.ts`'s offline `page.reload()` with
  `WebKit encountered an internal error`, the same pre-existing AP5/Q1 failure documented in the
  original audit. All receipt cases passed. The skipped cases are existing project-specific update
  and touch tests. This is not reported as a completely green browser suite; no skip/retry policy
  was changed to hide the failure.
- Own source review found no remaining actionable defect. The most complex changed flow is receipt
  preparation across asynchronous source selection, analysis completion and options refresh. It
  retains its existing state owner and pure command builder; loading suspends work without new
  states, while terminal errors and session replacement discard it. SQL/upload recovery remains
  wholly owned by AP1's common commit controller.
- External `agy-review`, `gemini-3.8-flash-high`, effort `high`, round 1: **APPROVED**, no actionable
  findings. The independent local clone had no remote; status and all source hashes remained
  unchanged after review. The target was `166d51abfa11c388dbf7820282d6b9d9213368fa` plus the AP4
  working-tree changes and inspected new files. Genuine provider/device checks remained open.

Final review additionally covers the image-selection guard: an already open picker may return
during an unchanged foreground check even while writes are temporarily disabled. The commit still
waits for verified-current permission; closed/invalid contexts, offline state and busy operations
continue to block capture. The browser regression covers both an already-running analysis and a
photo returned while freshness is pending. The saved summary also uses locale-aware formatting and
wraps long values within the sheet. Screenshot evidence is generated under `output/ap4/`.

The final receipt-only browser run passed **54/54** cases across Chromium, Pixel 5 and iPhone WebKit,
including both foreground orderings, under zero retries. The 320-pixel post-save summary was also
visually inspected; the browser assertions verify it fits the sheet width.

External final review (round 2), same model and effort: **APPROVED**, no actionable findings. It
reviewed the final picker guard, responsive summary, corresponding browser regressions and recorded
verification results. Snapshot status and all source hashes again remained unchanged. No external
edits were copied into the checkout. The final `check:local` passed on this source; only this review
result was appended afterward. Both reviews approve the implementation, explicitly excluding full
provider/device qualification and production release approval.

The browser image probe exposed an existing integration defect: both CSP sources blocked the
decoder fallback's temporary `blob:` image URLs. The document meta policy, optional Apache header,
and canonical policy now allow `blob:` only for images. The browser regression deliberately disables
bitmap decoding and verifies the image-element fallback and JPEG dimensions under the real CSP.
