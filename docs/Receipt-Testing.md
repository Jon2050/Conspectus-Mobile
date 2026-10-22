# Receipt feature testing

The receipt workflow already has unit, integration and browser tests. Real model quality requires
an additional, explicitly invoked provider run with independent expected answers. The local harness
uses the production image codec/normalizer in Chromium, the production catalog and completion clients,
both shipped prompts, the analysis controller and both parsers. It does not sign in to Microsoft,
open a personal database or save transfers to OneDrive. Existing integration/browser tests cover
those later stages with controlled services.

## Local setup

Use the Node version required by the README. Install Chromium once with
`npx playwright install chromium` if necessary.

Copy [`.env.receipt.example`](../.env.receipt.example) to `.env.receipt.local`. Fill in:

| Variable                    | Value                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`        | Your own OpenRouter API key.                                                    |
| `OPENROUTER_VISION_MODEL`   | Exact ID from the `visionModels` list printed by `npm run test:receipt:models`. |
| `OPENROUTER_TRANSFER_MODEL` | Exact ID from the `transferModels` list printed by the same command.            |
| `RECEIPT_TEST_CASES`        | Path to a JSON manifest; defaults to the 14-case synthetic gold corpus.         |

First fill in only the API key and run `npm run test:receipt:models`; then set both model IDs.
The same model may serve both roles if eligible. Eligibility follows the app's current free pricing,
image/text modalities and account catalog restrictions, with the explicit manual paid
addition `meta/muse-spark-1.3-contributor`. A successful catalog load appends it once, marks it paid
and supplies live reasoning metadata or the verified minimum `minimal`. It is not automatically selected. The catalog is fetched directly from
OpenRouter's `/api/v1/models/user` using the existing key. Intelligence scores and canonical-version
matches are not required; no benchmark metadata request is made. The explicit router/harness
exclusions remain in effect. Structured-output support is not a filter or request requirement;
the prompt requests JSON and the app checks it locally.
Catalog selection belongs to Settings. The explicit `test:receipt:models` command simulates that
prior visit and saves resolved minimum reasoning in ignored
`output/receipt-live/model-reasoning.local.json`, bound to a SHA-256 digest of the key and exact model
IDs; the key itself is not copied there. The live command reads that snapshot locally and makes no
catalog request, before or during photo analysis. Missing, damaged or key/model-mismatched
metadata leaves the provider default untouched, just like migrated app settings; minimum active
reasoning is then not guaranteed. Run the catalog command explicitly to refresh known capabilities.
Reports record `metadataLatencyMs: 0` for live analysis and the prior snapshot timestamp/setup
latency separately as `priorSettingsMetadata`. Analysis sends only two completion POSTs. There are no retries or automatic model switches.

The env file is read only by the Node test process. Never prefix its key with `VITE_`: that prefix
exposes values to the frontend build. Shell environment values override the local file. These test
settings do not configure the app's account-scoped Settings screen.

## Commands

| Command                            | Purpose                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run test:receipt`             | Offline receipt/OpenRouter/controller unit and integration regressions.                     |
| `npm run test:receipt:e2e`         | Settings, capture, normalization, lifecycle, auto-save and recovery browser tests.          |
| `npm run test:receipt:check`       | Check the local image setup using synthetic provider replies; no OpenRouter call.           |
| `npm run test:receipt:models`      | Request the live account-filtered model catalog; needs only the key.                        |
| `npm run test:receipt:live`        | Send configured receipt images through both actual OpenRouter stages.                       |
| `npm run test:receipt:benchmark`   | Compare current free models once per suitable role on the first manifest image.             |
| `npm run test:receipt:image-sizes` | Compare five image sizes with three sequential extraction requests per size and photo gold. |

The live command sends each normalized image to the selected vision model and the extracted data to
the second model. Invoke it deliberately after configuring the key and models. Neither ordinary
`npm test` nor CI invokes it. A full 14-case corpus can make up to 28 completion requests and zero metadata
requests; availability and provider quotas still apply. There are no automatic retries.

The check command verifies the browser image path and orchestration using a known synthetic answer.
It makes no assertion about OCR or grouping quality on the supplied photograph.

## First photograph and further cases

Keep private photos and their manifests in `tests/fixtures/receipts/photographs.local/`, which is
ignored by Git. Set `RECEIPT_TEST_CASES` to that folder's `cases.json`. Image paths are relative to the
manifest. A minimal first case looks like this:

```json
[
  {
    "id": "rewe-photo",
    "image": "receipt.jpg",
    "expectedExtraction": {
      "receiptDate": "2026-10-19",
      "receiptTotalCents": 3279
    }
  }
]
```

For the supplied IMG_6633 photo, the local manifest contains the complete 24-line monetary
transcription, including final position totals, positive deposits and three deposit returns; its sum is
3279 cents. Merchant spelling, exact item strings and semantic grouping still require independent
review. Abbreviations such as `NATUR`, `TRINKM. BE CHOCO` and `KIRSCH SAKURA SF` are now assigned by
plausibility using receipt context. Do not declare model-generated grouping to be independent gold.

For fully reviewed cases use `extraction` and `derivation` in the same format as
[`gold.json`](../tests/fixtures/receipts/gold.json). Successful results are compared exactly, except
transfer title wording and group order. A declared error or `derivation: null` means the case expects
rejection; only an actual parser-valid model rejection qualifies, never a network/auth/contract error.
Partial `expectedExtraction` cases assert only their specified fields plus optional ordered line
totals. A passing partial case is explicitly marked as still requiring grouping review. If `expectedItems`
is provided, the live test also checks ordered article names/quantities against their amounts with
the photograph evaluator and reports `photoQuality` mismatches. Matching totals alone never qualify
article assignment. Existing pre-change reports retain their original, less strict verdict.

To evaluate the entire synthetic corpus, set:

```dotenv
RECEIPT_TEST_CASES=tests/fixtures/receipts/gold.json
```

## Diagnostics and coverage limits

The benchmark discovers the same live catalog as the app, normalizes the first image once and
executes sequentially without retries or fallback. Every eligible vision model receives that image.
The configured vision model is tried first; its valid extraction (or the first other valid extraction)
is used unchanged for every text model. Partial monetary expectations must match before choosing
that reference. A manifest `benchmarkExtraction` (previous recorded extraction, not independent gold)
or a full gold `extraction` can provide a reference if all vision calls fail. The same partial
monetary expectations are checked for those references.
If no reference exists, the benchmark fails explicitly before text calls.

For isolated stage measurements, temporarily set the Node-only shell variable
`RECEIPT_BENCHMARK_STAGE` to `extraction` or `derivation` (`all` is the default). A derivation-only
run needs a manifest reference. This permits completing a text comparison after vision timeouts
without repeating vision calls. Remove the shell variable afterwards. Neither this setting nor
the benchmark reference changes app configuration or the live workflow test's expectations.

The comparison writes `output/receipt-benchmark/<timestamp>/report.json` after every request,
including total completion latency, time to HTTP headers, provider, token/reasoning usage, raw answer,
parser diagnostics and failures. An HTTP 200 header alone is not a completed response. Each request
has a 90-second whole-body deadline, matching the production budget. Failures are comparison data;
the benchmark itself passing means every planned request ran, not that every model passed quality
checks. One observation per role/model is not an average or a reliability ranking.
Set `RECEIPT_BENCHMARK_REPETITIONS=3` for three sequential rounds per model; the default is one.
For a vision-only photo comparison, also set `RECEIPT_BENCHMARK_STAGE=extraction`. Reports include
independent photo quality checks: merchant/date/total and ordered line final amounts must match
exactly; article labels permit typography differences and 0/O confusion. Quantities remain exact.

Exact request bodies (including image data), raw responses and the normalized image are saved
beside the comparison report, without authorization headers. These files contain private receipt
data and must remain ignored. Production request construction is shared with this harness.
Production selects the lowest positive reasoning effort exposed in the live model metadata;
requests explicitly set `enabled: true` together with that effort. `none` is never selected by
production. Without advertised active efforts, optional reasoning is disabled; fixed mandatory
reasoning remains enabled. Token-budget support alone does not declare a minimum active budget.
Models without declared reasoning
capabilities leave the provider default untouched rather than inventing support.
The [OpenRouter reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
defines the catalog's supported efforts and enable/disable semantics.
`RECEIPT_BENCHMARK_REASONING=compare` compares that setting with reasoning off; `lowest` is the default,
and `off` runs only the disabled variant. Mandatory reasoning is recorded as unsupported for off
without issuing an invalid request. Reports include the exact reasoning setting and capabilities.
MiniMax currently declares default `max`, minimum `low`, mandatory; NVIDIA Ultra declares minimum
`medium` and optional reasoning. Super VL exposes a binary switch. These are live metadata, not a
hardcoded capability table. Hiding reasoning with `exclude` would not reduce its generation time.

Stage-two wire answers contain `status`, `errorReason`, one `buyplace` and `groups` with name,
category names and source indexes, without amounts. The parser attaches locally calculated amounts,
the stage-one date and total
and expands the shared purchase location into every local command. No echoed date/total is trusted.

Live runs write `output/receipt-live/<timestamp>/report.json`, flushing after each case. Reports
include model IDs, source revision/dirty flag, prompt/rule versions, normalized dimensions, HTTP
statuses, local provider-error details, completion text, exact parser diagnostics, stage, rejection reason, expectation mismatch
and latency. API keys are redacted; request headers and image payloads are not stored. Reports still
contain receipt details and remain ignored. A report is retained even when assertions fail.
Each case has an additional five-minute whole-run deadline covering preparation and both stages;
progress logs show normalization, HTTP status and analysis phase. This diagnostic guard does not
change the app's existing provider deadlines.

Use the error stage to distinguish image preparation, model eligibility, provider availability,
extraction structure/arithmetic, derivation and gold mismatch. An HTTP or malformed-output failure
must not be counted as a successful safe rejection. Passing schema/arithmetic checks alone does not
establish correct OCR or categories. Do not commit the private photo, env file or reports.

The covered layers are settings/catalog, image decoding/orientation/limits, two-stage prompts and
partial responses, editable receipt review, explicit Save, account/category setup, transfer construction, atomic SQLite writes, conditional upload,
conflicts, cancellation and byte-only recovery. Real iPhone/Android capture, HEIC support, mobile
memory pressure, real Microsoft/OneDrive access and correction in Desktop remain separate checks in
[`Manual-Device-QA.md`](Manual-Device-QA.md). A local Chromium/photo/provider pass cannot qualify them.

## Photograph size comparison

Run `npm run test:receipt:image-sizes` to compare the configured vision model at 2560, 1920, 1600,
1280 and 960 pixels on the long edge. The first manifest case must provide independently transcribed
`expectedExtraction` metadata, all `expectedLineTotalsCents` and `expectedItems` containing each
printed `name`; quantities and unit prices are outside the extraction contract. Recorded
model answers are not used as independent gold. The private sample manifest includes this reference.

Each variant is encoded directly from the original photograph using the production browser codec
and normalizer at JPEG quality 0.85, without upscaling. Three sequential rounds change size order
to reduce ordering bias. Only stage one is called because stage two receives no image. Requests
use the configured model, current production eligibility checks, active minimum reasoning and the
90-second whole-response deadline, with no automatic retries. Production image sizing is unchanged
by running this experiment.

Reports and exact request/response files are saved under ignored `output/receipt-image-sizes/`.
They separate exact metadata and line amounts from item-label agreement, retain errors,
provider and token usage, and record typography differences. Label comparison ignores punctuation,
whitespace and case and equates umlauts with AE/OE/UE; changed letters or digits remain mismatches.
Quantities compare the first printed number numerically, rather than requiring identical unit/price
formatting. The command passing means all 15 planned requests completed or recorded a failure,
not that every size produced correct data. A single photograph and three repetitions do not
establish reliability for other receipts or devices.

The 2026-10-21 MiniMax `low` comparison completed all 15 requests. Median extraction latencies
were 24.1 s (2560 px), 41.2 s (1920 px), 44.9 s (1600 px), 37.7 s (1280 px) and 34.4 s (960 px).
Parser-valid exact metadata/line-amount checks passed 2/3, 3/3, 3/3, 3/3 and 0/3 respectively.
Checking labels and quantities as well found additional errors: five answers differed only in a
milk-label `0`/`O`, while others shifted labels between amounts or omitted lines. None was fully
correct against the strict visual transcription. Smaller inputs used fewer image/input tokens but
did not consistently reduce reasoning tokens or latency. Production therefore retains the 2560 px
default. Exact responses, all field mismatches and measurements are in the ignored local run
`output/receipt-image-sizes/2026-10-21T18-26-35.713Z/vergleich.md` and `evaluation.json`.

## Editable review and partial results

Model `status: "error"` responses retain readable typed fields and partial groups. Unknown top-level
fields may be null. A failed local success check does not become a successful analysis; bounded
suggestions can still populate the manual draft. The system template visibly contains
`{{CUSTOM_PROMPT}}`, replaced once with the user's literal grouping instructions.

Analysis completion and account selection never book anything. The review shows one shared date
and purchase location and editable rows with name, categories and amount. Each row has a collapsed
article-name list with numbered destinations for all other rows. Moves update source/destination
amounts from signed source lines and preserve article identity, including duplicate names. Only empty
rows can be removed; button numbers update after adding/removing groups. Manual amount corrections
remain editable, but moving an article recalculates the two affected amounts. The active form has
no photograph-again button; close and reopen Add for a new receipt. Offline tests cover exact moves,
discounts, empty/nonpositive groups, overflow, dynamic numbering and Save without extra provider calls.
Save validates the
entered fields against current local accounts/categories and commits one immutable batch through
the common SQL/conditional-upload/recovery controller. The destination is always primary spendings.
The extracted total and entered sum are shown independently; a difference warns the reviewer and
does not prevent deliberately correcting an OCR error. No stale OCR coverage proof is claimed for
manually edited rows. Context replacement/reset clears the draft; unchanged refresh and temporary
offline transitions retain it. Currency is not checked.

## Provider investigation on 2026-10-21

Eight small text probes compared a minimal standard chat request with the app's
`provider: { allow_fallbacks: false }` setting, using the same key and endpoint. These are availability
probes, not receipt quality measurements:

| Free model                            | Minimal request               | App provider setting |
| ------------------------------------- | ----------------------------- | -------------------- |
| `google/gemma-4-26b-a4b-it:free`      | HTTP 429                      | HTTP 429             |
| `nvidia/nemotron-3.5-super-vl:free`   | HTTP 200, token limit reached | HTTP 200, `OK`       |
| `minimax/minimax-m3.1-flash:free`     | HTTP 200, `OK`                | HTTP 200, `OK`       |
| `thinkingmachines/inkling-small:free` | HTTP 403                      | HTTP 403             |

Gemma's error metadata explicitly identified Google AI Studio and
`limit_source: upstream_provider_shared_pool`. The same failure occurs without app-specific provider
settings or image data; this evidence identifies an upstream shared-capacity limit rather than a
malformed app request. Inkling's response restricted its free endpoint to approved agentic harnesses.
A catalog entry does not guarantee that an endpoint will accept
this app's inference request. There is no automatic model fallback or automatic receipt retry.

The full IMG_6633 run with MiniMax extraction and Nemotron derivation received HTTP 200 for the
image completion headers but did not finish the extraction response within the app's 60-second
deadline. A separate Nemotron-only photo run produced no final result over several minutes and was
stopped; its analysis stage could not be established from the old progress-free harness. The new
whole-run guard and phase logging make such incomplete runs diagnosable. Neither run is a receipt
quality pass. These were earlier provider-default measurements. A subsequent 2026-10-21 run with
the shortened prompts and explicit MiniMax `low` completed the full photo analysis in 32.6 seconds
and matched the partial monetary gold. The reasoning comparison measured MiniMax at 19.7 seconds
for extraction and 10.9 seconds for grouping. NVIDIA off was faster but both text models produced
group arithmetic errors; Super VL on timed out after 90 seconds. These single-case observations
do not establish average latency or general semantic accuracy.

## Local arithmetic and stored reasoning contract

Derivation system prompt version 12 uses `groups` without model-supplied amounts. Gold responses and
provider mocks contain only `name`, `categoryNames` and `sourceItemIndexes` within each group; local parsed results
still contain amounts, date and purchase location for existing review/commit consumers. The parser
sums signed extraction lines using safe integer cents, rejects overflow (including intermediate
sums), duplicate/unknown/missing source references and nonpositive complete groups, and requires
complete coverage and the validated receipt total for success. Partial responses use only valid
known references; no missing line becomes zero. Arithmetic consistency proves no semantic mapping.

Settings schema 2 persists optional gateway capabilities per account and selected role/model.
Successful catalog validation and model selection replace these snapshots; key/model/account changes
cannot reuse an unrelated snapshot. The Settings catalog GET uses a 30-second deadline and cancellation boundary.
This GET does not belong to receipt analysis.
Schema-1 configurations are still usable directly after restart: absent/invalid capabilities use
the provider default without an invented effort. This migration fallback cannot guarantee active
minimum reasoning. A successful Settings visit supplies known capabilities for subsequent runs and
restarts; known efforts use enabled plus the lowest positive level. Without advertised active
efforts, optional reasoning is disabled while mandatory reasoning remains enabled. In particular,
Dots3 currently declares optional reasoning without effort selection, so the app requests off;
the previous `enabled: true` selected a default and did not guarantee minimal reasoning.

Offline browser tests cover restart with schema 1 and 2, zero metadata GETs, only two POSTs,
role-specific unavailable-model hints, completion rate limiting, unchanged settings/review data and
no writes before Save. Settings tests verify model selection works without benchmark requests.
Real HTTP/provider failures remain failures, never successful quality evidence. Local report fields
separate prior snapshot setup latency, each whole completion latency and total receipt-analysis latency;
raw model contents and parser diagnostics are retained unchanged (apart from key redaction).

## 2026-10-21 implementation comparison

All runs used the selected MiniMax model in both roles with known active `low` reasoning:

| Run                                                   | Extraction | Derivation | Receipt analysis | Metadata in analysis                          |
| ----------------------------------------------------- | ---------: | ---------: | ---------------: | --------------------------------------------- |
| Before, prompt v7                                     |   47.624 s |    7.472 s |         59.123 s | Four serial GETs, 2.042 s to response headers |
| Intermediate v8, old arithmetic instructions retained |   64.077 s |    7.327 s |         73.746 s | None                                          |
| Final v8 prompt                                       |   21.524 s |   11.113 s |         34.399 s | None                                          |
| Final harness, persisted prior catalog snapshot       |   19.356 s |   14.133 s |         35.224 s | None                                          |

The final harness run made exactly two completion POSTs. Its explicit prior catalog setup command
finished separately in 1.234 s and persisted minimum reasoning; the live run itself made no setup
requests. The earlier v8 harness measurements used a separate simulated prior Settings visit before
timing analysis (0.749 s / 0.550 s); this prefetch has since been removed from the live command too.
These are individual observations, not evidence of a reliable speedup or average latency.

All four responses fail the strict independent photograph transcription check. The old run's
original verdict tested only partial monetary expectations and must not be read as full quality
approval. The final harness run matched all 24 ordered line amounts and the 3279-cent total, but
used O instead of 0 in the milk label. Manual review against the photograph also found one 25-cent
positive deposit in the sweets group contrary to the default rule. In the preceding run the order
of a 25-cent deposit and a 255-cent drink was reversed, and five positive deposit lines were
assigned to sweets. Matching sums prove neither OCR labels nor semantic grouping.
The live harness now fails rather than passing on money totals alone. The local transcription was
visually checked but is not separately human-certified. No provider, device or release qualification
is claimed. Exact original responses remain in ignored `output/receipt-live/` runs
`2026-10-21T19-15-50.005Z`, `2026-10-21T19-20-48.571Z`, `2026-10-21T19-25-25.692Z` and
`2026-10-21T19-32-36.836Z`; the local comparison is
`output/receipt-optimization/comparison.json`.

Stage-one prompt version 7 uses `receiptTotal` and item `lineTotal` strings with decimal commas
and exactly two fractional digits, without currency symbols (for example `"5,46"` and `"-0,25"`).
Items contain only `index`, `name` and `lineTotal`; deposits/returns are normal signed positions.
The model neither converts to cents nor sums/checks amounts. The production parser performs
integer-only conversion, overflow checks and the exact total comparison locally. Internal gold
metadata (`expectedExtraction`, `expectedLineTotalsCents`) continues to use integer cents; complete
`extraction` and `benchmarkExtraction` fixtures use the provider wire format. Historical reports
retain their original prompt/schema and must not be replayed as current-contract responses.

The grouping prompt (version 12) defines the receipt context, storeName, items and their fields,
and the corresponding groups/buyplace output. lineTotal is only an optional price-context hint,
never a model calculation or output amount. It asks only for `groups` with `name`, `categoryNames` and
`sourceItemIndexes`, plus shared `buyplace`, status and errorReason. One complete group is valid.
The local parser enriches groups into internal booking data and keeps all arithmetic/coverage checks.
Only `storeName` and `items` (`index`, `name`, `lineTotal`) are sent to grouping. Extraction
`status`, `errorReason`, `receiptDate` and `receiptTotal` stay local and are not described as input
fields in the prompt. Output `status` and `errorReason` still describe grouping success/failure.
Legacy wire `transfers` are rejected. Business categories and assignments are defined only in the
editable default grouping rules (version 9), inserted literally at the end of the system template.
The gastronomic group has priority and includes all positions; otherwise all deposits, discounts
and returns belong to ordinary food, with separate sweets/sweet-drinks and household groups.
The fallback for otherwise unassignable goods is `Sonstiges` with an empty `categoryNames` array.
Dynamic free models require an explicit `:free` catalog variant, zero relevant token/request prices
and exclusively text output. Models also outputting audio, images or video are excluded even with
zero text prices. Zero text prices alone do not prove that a media generator is free.
The automatic multi-model benchmark keeps its free-model scope; explicitly configured live/image-size
tests may use the manual paid option available in both Settings roles. Both role loops in the
automatic benchmark exclude paid options. Historical response reports keep their original schemas.
