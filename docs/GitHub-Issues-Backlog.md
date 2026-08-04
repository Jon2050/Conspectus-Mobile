# Conspectus-Mobile GitHub Issues Backlog

This document is the lightweight active issue index for Conspectus-Mobile maintainers and
contributors. It makes planned work, status, dependencies, and GitHub links visible in one place so
that work can be selected and tracked consistently. Detailed requirements, acceptance criteria,
discussion, and implementation evidence belong in the linked GitHub issue and pull request; this
file does not replace them or the delivery workflow in [`CONTRIBUTING.md`](CONTRIBUTING.md).

The completed MVP backlog is preserved for historical reference in
[`archive/releases/mvp/GitHub-Issues-MVP-Backlog.md`](archive/releases/mvp/GitHub-Issues-MVP-Backlog.md).
Do not copy completed MVP entries into this active backlog.

## Issue status legend

- `:green_circle:` Open
- `:yellow_circle:` In progress
- `:white_check_mark:` Done

Update the marker in an issue heading when its status changes. The linked GitHub issue remains the
authoritative source for its live state and details.

## Completion rule

An issue is considered done in this backlog only when:

1. Its implementation has reached `main` through the contribution workflow in
   [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. The required checks for the merged commit are green.
3. The GitHub issue is closed and its merged head branch has been deleted.
4. The corresponding backlog heading uses `:white_check_mark:` and links to the closed GitHub
   issue.

## Add an issue

1. Create the GitHub issue with the appropriate template from
   [`.github/ISSUE_TEMPLATE`](../.github/ISSUE_TEMPLATE/).
2. Copy the entry template below into [Backlog](#backlog).
3. Replace every placeholder, use exactly one primary label, and link the GitHub issue.
4. Use the GitHub issue number as the task ID when no separate project or milestone ID exists.

```markdown
### :green_circle: {{TASK_ID}} {{ISSUE_TITLE}}

- Label: `{{PRIMARY_LABEL}}`
- Milestone: `{{MILESTONE_OR_NONE}}`
- Summary: {{ONE_OR_TWO_SENTENCE_SUMMARY}}
- Depends on: `{{TASK_IDS_OR_NONE}}`
- GitHub: [#{{ISSUE_NUMBER}}](https://github.com/Jon2050/Conspectus-Mobile/issues/{{ISSUE_NUMBER}})
```

## Backlog

Add new issue entries here using the template above. Keep entries ordered by milestone or, when no
milestone exists, by task ID.

## M9 - Receipt Capture + OpenRouter

GitHub milestone:
[M9 - Receipt Capture + OpenRouter](https://github.com/Jon2050/Conspectus-Mobile/milestone/9)

Goal: let users capture a receipt from New Transfer on iOS or Android, run image extraction and
structured transfer derivation while they select the source account, and automatically save the
strictly validated one-or-many batch through the existing desktop-compatible OneDrive write path
without a review screen.

Scope:

- Store the OpenRouter API key, two independently selected model IDs, and editable/resettable
  receipt-item grouping rules locally per active Microsoft account; keep both complete stage prompts
  app-owned and populate both model comboboxes from current OpenRouter catalog, pricing, modality,
  and structured-output metadata.
- Keep both model comboboxes empty and disabled until the API key passes an authenticated catalog
  request; fetch a fresh catalog whenever Settings is opened and clear any saved role selection
  that a successful refresh proves no longer meets its free/capability criteria.
- Offer no manual model-ID fallback; keep the grouping-rules editor hidden until key validation
  succeeds, expose it as one free-form multiline text field without a structured category editor,
  and never display or allow editing of either complete app-owned stage prompt.
- Add a photo button to New Transfer backed by the native iOS/Android image capture/picker rather
  than a custom in-PWA camera view; normalize the image, remove metadata, and keep it only in memory
  for the first OpenRouter call. Accept an existing gallery image only when the same operating-system
  control offers it without a separate app workflow.
- Use a free vision-capable model to extract the store, date, EUR total, and every priced article
  with exact cent amounts while the user chooses the source account, or return a meaningful error
  reason.
- Use a separate free model to derive fixed-schema transfer JSON, group every extracted article
  exactly once according to the prompt-defined group/category rules, and preserve the receipt total
  exactly without rounding; pass the editable rules verbatim without app-side interpretation, start
  it immediately after extraction without waiting for the account, and allow the same compatible
  model in both roles.
- Require the user to choose the source account for every run, resolve the prompt-produced category
  names against local data, validate the complete batch locally, and gate only local transfer
  construction/saving on that selection, without a transfer review or editing step.
- Abort the complete receipt run on any capture, LLM, or pre-save validation error, show a
  meaningful localized message, discard all transient state, and require a fresh photo
  capture/selection rather than retrying the same image.
- Commit the validated transfers in one SQLite transaction, export once, and use one conditional
  OneDrive upload while showing the stages "Foto auslesen", "Transferdaten erstellen", and
  "Transfers erstellen", reporting the created-transfer count, and preserving retry, eTag
  conflict, and cache-reconciliation invariants.

Non-goals:

- No backend or proxy, project-owned or paid model, automatic provider switching, or offline
  analysis/write queue.
- No custom camera stream/live preview, separate gallery UI, manual OpenRouter model-ID input,
  editable extraction prompt, structured prompt builder, or same-image LLM retry.
- No foreign-currency handling, currency conversion, rounding, review/editing step, partial
  acceptance, or persistence of receipt images or LLM results.
- No app-enforced ZDR/no-data-collection routing restriction; provider privacy remains an explicit
  user disclosure and stricter OpenRouter account/guardrail settings still apply.
- No transmission of account IDs, balances, transfer history, or the Conspectus database to
  OpenRouter.
- No receipt library, SQLite schema migration, or desktop-application change.

Exit criteria:

1. A user can configure their own OpenRouter key and, only after live validation, select compatible
   free models from two filtered comboboxes. Every Settings entry refreshes the catalog, invalid
   prior selections become empty without an automatic/manual replacement, the same eligible model
   may fill both roles, and only the then-visible free-form grouping-rules field is
   editable/resettable.
2. A user can tap the photo button on New Transfer and capture a receipt on iOS or Android; the
   native system camera/picker returns a normalized, metadata-free image that begins extraction
   while an unselected source-account list is shown and is never persisted by the app. An existing
   image is accepted only when the same native control supplies it at no additional app complexity.
3. The first call extracts all articles and the receipt total, then the second call applies the
   editable prompt's groups and category arrays without waiting for account selection. The
   schema-valid transfers cover every extracted article once and sum exactly to that total; the
   account is required only before local construction/saving, and either model returns a meaningful
   reason when it cannot complete its task. Any pre-save error ends the entire run, clears its
   state, and requires a fresh photo.
4. A valid batch is applied automatically and atomically through one `If-Match` upload while the UI
   shows the three named processing stages and then a localized created-transfer count; failures,
   retries, conflicts, and cache reconciliation cannot create duplicate or partial transfers.

### :white_check_mark: M9-01 Configure live OpenRouter model choices, derivation prompt, and receipt privacy

- Label: `security`
- Milestone: `M9 - Receipt Capture + OpenRouter`
- Summary: Add account-scoped key and prompt settings plus separate live-filtered comboboxes for
  free vision and structured-output models. Model selection requires a validated key, refreshes on
  every Settings entry, clears newly invalid selections, has no manual-ID fallback, and permits one
  compatible model in both roles; only one plain free-form grouping-rules field is then
  visible/editable.
- Depends on: `none`
- GitHub: [#251](https://github.com/Jon2050/Conspectus-Mobile/issues/251)

### :white_check_mark: M9-02 Capture receipts from New Transfer and start ephemeral extraction

- Label: `feature`
- Milestone: `M9 - Receipt Capture + OpenRouter`
- Summary: Add a photo button to New Transfer using the native iOS/Android camera/picker rather than
  a custom camera or gallery flow, optionally accept an OS-offered existing image through that same
  control, normalize and strip it, and start vision extraction while keeping image bytes ephemeral.
- Depends on: `M9-01`
- GitHub: [#252](https://github.com/Jon2050/Conspectus-Mobile/issues/252)

### :white_check_mark: M9-03 Run two-stage OpenRouter receipt extraction and transfer derivation

- Label: `feature`
- Milestone: `M9 - Receipt Capture + OpenRouter`
- Summary: Use the configured vision prompt to extract every article, store, date, and exact EUR
  total, then use the hidden second prompt, verbatim editable grouping rules, and a fixed JSON Schema
  to create one or more exact transfers without waiting for account selection; only the grouping
  rules are user-editable, and every error aborts the run with a meaningful message and no same-image
  retry.
- Depends on: `M9-01, M9-02`
- GitHub: [#253](https://github.com/Jon2050/Conspectus-Mobile/issues/253)

### :white_check_mark: M9-04 Select the source account and show staged automatic processing

- Label: `feature`
- Milestone: `M9 - Receipt Capture + OpenRouter`
- Summary: Show the account list while both LLM stages advance, require a fresh selection only
  before local transfer creation, then automatically advance through "Foto auslesen",
  "Transferdaten erstellen", and "Transfers erstellen" without review or editing; pre-save failure
  clears the run and returns to a fresh photo start.
- Depends on: `M9-03`
- GitHub: [#254](https://github.com/Jon2050/Conspectus-Mobile/issues/254)

### :white_check_mark: M9-05 Automatically commit validated receipt transfers through OneDrive

- Label: `feature`
- Milestone: `M9 - Receipt Capture + OpenRouter`
- Summary: Apply the validated batch automatically in one SQLite transaction and one eTag-guarded
  OneDrive upload, with continuous progress, a localized created-transfer count, and duplicate-safe
  retry, conflict, and cache-reconciliation behavior.
- Depends on: `M9-04`
- GitHub: [#255](https://github.com/Jon2050/Conspectus-Mobile/issues/255)

## No milestone

### :green_circle: #256 Add income-only and amount-aware text filters to Transfers

- Label: `feature`
- Milestone: `none`
- Summary: Add top-of-page income-only and free-text filters for the selected month's transfers;
  live text search removes commas and periods from both query and searchable values, matches the
  displayed amount (so `234` finds `12,34 €`), excludes the date, and changes no query or sync
  behavior.
- Depends on: `none`
- GitHub: [#256](https://github.com/Jon2050/Conspectus-Mobile/issues/256)
