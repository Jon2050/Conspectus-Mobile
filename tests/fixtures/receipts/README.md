# Synthetic receipt corpus

All images are generated SVG text fixtures with fictional transactions dated 2026-10-20; they contain
no personal data. `gold.json` separately records expected stage-one extraction and stage-two groups
or rejection. Derivation wire groups have no amounts; expected amounts are calculated locally
from the independently transcribed signed source lines. The corpus covers mixed groups, discount, deposit/return, restaurant precedence,
quantity/tax/payment, shared/normalized merchant names, plausible abbreviations, unsupported goods,
items without plausible context, refunds, zero total,
negative groups, long receipts, unreadable fields and non-EUR currency.

The source images are inspectable independently from the gold JSON. Browser tests exercise the real
SVG-to-JPEG normalization boundary. They mock model responses and cannot measure OCR quality.
For real model qualification, rasterize each source using the same browser normalization path and
send the resulting JPEG with the shipped prompts and default rules. Record both provider responses
without correcting them to match gold. Gold grouping titles are examples; category order, item
coverage, merchant/date and amounts must match. Review any future photograph/gold addition separately.

Run the contract/evaluator tests:

```powershell
node node_modules/vitest/vitest.mjs run src/features/receipt/receiptCorpusEvaluation.test.ts
```

For recorded provider evaluation, prepare a JSON array with one object per model pair:

```json
[
  {
    "visionModelId": "actual selected vision model ID",
    "transferModelId": "actual selected text model ID",
    "sourceRevision": "40-character source Git SHA",
    "capturedAt": "2026-10-20T20:00:00Z",
    "extractionPromptVersion": 6,
    "derivationPromptVersion": 8,
    "rulesVersion": 5,
    "cases": [
      {
        "id": "mixed-discount",
        "extraction": {},
        "derivation": {},
        "latencyMs": 1234
      }
    ]
  }
]
```

Replace the empty response objects with actual parsed model JSON and include every corpus ID exactly
once. When extraction fails, derivation is `null`. A failure response is the actual app-conforming
`status: "error"` object, not a fabricated success or a human-corrected answer. Keep transport errors
in a separate run log; they are availability failures rather than semantic evidence.

```powershell
$env:RECEIPT_EVALUATION_INPUT = 'C:\path\to\recorded-runs.json'
$env:RECEIPT_EVALUATION_REPORT = 'C:\path\to\evaluation-report.json'
node node_modules/vitest/vitest.mjs run src/features/receipt/receiptCorpusEvaluation.test.ts
Remove-Item Env:RECEIPT_EVALUATION_INPUT, Env:RECEIPT_EVALUATION_REPORT
```

The evaluator requires complete coverage and current prompt versions and writes metrics before
failing on unsafe acceptance or false rejection. Normal automated gold replay is only a contract
test. It does not create provider measurements. See
[AP4 decisions and open qualification](../../../docs/reviews/2026-10-20-ap4-receipt-qualification.md).
