# Production Rollback

This runbook restores the Conspectus Mobile production site from an immutable, previously
successful deployment artifact. The producer workflow in this repository validates and dispatches
the exact artifact; the website repository performs its existing staged upload and directory swap.
Operators must not copy build files, edit FTP directories, or reconstruct artifacts manually.

## When to roll back

Start incident triage immediately when production has any of these conditions after a deployment:

- the app route, manifest, service worker, or required install icons are unavailable;
- `deploy-metadata.json` does not match the approved release identity;
- sign-in, OneDrive synchronization, database reads, or transfer writes regress on the dedicated QA
  account;
- the production Lighthouse, security-policy, or post-deploy smoke gate fails after handoff began;
- a data-integrity or security defect makes the deployed commit unsafe.

The incident owner decides whether to roll back. Prefer rollback when the previous artifact is known
good and forward repair cannot restore a safe service inside the same 15-minute response window.

## Ownership and communication

- **Incident owner:** declares rollback, freezes production deployments, owns the timeline, and
  records the final decision.
- **Producer operator:** selects the known-good `commitSha` and `deployRunId`, runs `Rollback
Production`, and shares the workflow URL.
- **Website operator:** watches the `Jon2050/Jon2050_Webpage` consumer workflow and intervenes only
  if its repository credentials or hosting provider are unavailable.
- **Communications owner:** posts the start, validated target, dispatch, verification result, and
  resolution in the release/incident issue.

One person may hold several roles, but every role and timestamp must be named in the incident record.

## Select a known-good target

Use a previous successful `Deploy Production` run whose production behavior was verified. Record:

- full 40-character `commitSha`;
- numeric `deployRunId` from the workflow URL;
- its `conspectus-mobile-production-<commitSha>` artifact and expiry date;
- linked Quality, production smoke, Lighthouse, and QA evidence.

Do not use an expired artifact, a run from a branch other than `main`, a failed/incomplete run, or an
identity without prior production evidence. If no suitable artifact remains inside the 90-day
retention window, stop: this rollback path is unavailable and a newly qualified forward release is
required.

Only artifacts built for `basePath=/conspectus/` are valid after the path migration. Earlier
root-scoped artifacts cannot safely restore the current asset, manifest, or service-worker scope and
must be replaced by a newly qualified forward release.

## Dry run

Every change to the rollback contract is exercised automatically by the pull-request trigger in
`.github/workflows/rollback-production.yml`. Before a planned release, also run **Rollback
Production** manually from `main` with the selected `deploy_run_id`, `commit_sha`, and `execute =
false`.

The workflow must finish with a `Production rollback dry run` summary that matches all three deploy
identity fields. It performs no dispatch and no production mutation. It verifies:

1. exact successful producer-run provenance from `main`;
2. one unexpired artifact named for the requested commit;
3. artifact metadata (`commitSha`, `deployRunId`, `qualityRunId`, channel, base path, source branch);
4. the current website consumer's repository-dispatch, staging, validation, and promotion contract.

A missing secret, unavailable artifact, identity mismatch, or consumer-contract drift invalidates the
target. Stop and fix the prerequisite; never bypass a failed dry run.

## Execute rollback (target: under 15 minutes)

1. **Minute 0-2 — declare and freeze.** The incident owner announces rollback, stops new production
   runs, and posts the selected identity.
2. **Minute 2-3 — start automation.** From the `main` branch Actions page, run **Rollback Production**
   with the validated `deploy_run_id`, `commit_sha`, and `execute = true`.
3. **Minute 3-6 — validate and dispatch.** The producer revalidates provenance, artifact metadata,
   and the website consumer contract, then sends `conspectus-mobile-production-ready` with the exact
   validated fields.
4. **Minute 6-11 — stage and promote.** The website workflow downloads that producer artifact,
   validates it, uploads only to `conspectus.__incoming`, and atomically promotes the staging
   directory. Its short-lived backup protects a failed directory rename.
5. **Minute 11-13 — verify.** The producer polls production for at most eight minutes and requires
   the app route, manifest, service worker, icons, and `deploy-metadata.json` to expose the rollback
   identity.
6. **Minute 13-15 — communicate.** Record PASS/FAIL, both workflow URLs, live metadata, and the next
   incident action.

The workflow is serialized with production deployment and fails closed. Starting a second deploy or
rollback does not cancel the active operation.

## Verification and evidence

After workflow success:

- fetch `https://jon2050.de/conspectus/deploy-metadata.json` with normal TLS validation and confirm
  `commitSha`, `deployRunId`, and `qualityRunId`;
- open the app in a fresh browser profile and confirm the footer identity, manifest, service worker,
  and install icons;
- run the dedicated-QA-account sign-in, sync, Accounts, and Transfers smoke checks;
- link the producer rollback run, website consumer run, live metadata, and manual result in the
  incident/release issue;
- keep the production freeze until the incident owner declares recovery.

If automated verification fails after dispatch, production state is uncertain. Inspect the live
metadata and both workflow logs, keep the incident open, and choose another validated artifact or a
forward fix. Never claim rollback success from dispatch acceptance alone.

## Repository responsibilities

- `Jon2050/Conspectus-Mobile`: owns artifact identity, rollback target validation, dispatch, and live
  identity smoke verification.
- `Jon2050/Jon2050_Webpage`: owns artifact download, staging validation, FTP upload, live identity
  verification, and atomic promotion of the `/conspectus/` website subtree.

Changes to either side of this contract require a new dry run before the next release.
