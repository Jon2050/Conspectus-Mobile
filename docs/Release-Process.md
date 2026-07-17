# Release Process

This runbook is the single release checklist for Conspectus-Mobile. Use it for every production
release and keep the completed checklist and all linked evidence in the release pull request.
[`Manual-Device-QA.md`](Manual-Device-QA.md) supplies the required physical-device sub-gate; it
does not replace this end-to-end checklist.

[`../RELEASE-BLOCKERS.md`](../RELEASE-BLOCKERS.md) is the authoritative release-readiness working
file. A candidate may be created to gather the evidence required to clear a blocker, but do not
approve, merge, deploy, tag, or publish it while a prerequisite blocker (RB-01 through RB-03)
remains open. Once only RB-04 remains, follow this runbook to perform and record the actions that
clear it. Update the blocker file with evidence as blockers are cleared instead of maintaining
another blocker list.

## Release identity and ownership

- Use an unused semantic version from `package.json`; `package-lock.json` must contain the same
  version. The release branch is `release/v<version>` and the immutable annotated tag is
  `v<version>`.
- Create the release branch from the current, green `main`. Production deployment remains
  main-only. Merge the release pull request with **Rebase and merge**, then delete its head branch.
- Never move or reuse a published tag. A correction after a tag or production release uses a new
  patch version and a new release pull request.
- The human release owner is the repository owner or a delegated maintainer. That person records
  the go/no-go decision in the release pull request and starts the production workflow.
- Device QA may be performed by the release owner or another named tester, but the tester and exact
  device/browser versions must be recorded.

The active default-branch ruleset enforces pull-request delivery, rebase-only merging, linear
history, and the strict `Quality Gate` status check. It currently requires zero approving GitHub
reviews, so the human release-owner sign-off below is an explicit procedural gate recorded in the
release pull request. The reviewer-agent result is supporting engineering review, not a substitute
for that human decision.

The non-main preview URL is a shared slot. Coordinate a release-candidate test window so no other
non-main branch deploys to `/previews/test/` during physical-device QA. If the slot is overwritten,
stop and redeploy the release branch, reconfirm its identity, and rerun affected device scenarios.

## Canonical release checklist

Copy this entire checklist into the release pull request body or a dedicated release pull request
comment. Do not maintain a second release checklist elsewhere.

### 1. Prepare the release candidate

- [ ] Confirm every issue in the intended release scope is merged, its required checks are green,
      and known limitations are listed in the release notes.
- [ ] Confirm the two-repository [`Production-Rollback.md`](Production-Rollback.md) runbook is
      available and a no-mutation `Rollback Production` dry run passes for the selected known-good
      `commitSha` and `deployRunId`. Link that workflow run in the release evidence.
- [ ] Pull the current `main`, confirm its `Quality Gate` is successful, and create
      `release/v<version>` from that exact commit.
- [ ] Update `package.json` and both root version fields in `package-lock.json` to the same unused
      semantic version. Do not create the tag yet.
- [ ] Prepare release notes using the template below, including all included issues, user-visible
      changes, operational changes, and known limitations.
- [ ] Run `npm ci`, `npm run audit:dependencies`, `npm run format`, `npm run lint`,
      `npm run typecheck`, `npm run test`, `npm run build`, `npm run check:bundle-size`, and
      `npm run test:e2e`; record the successful results in the release pull request.
- [ ] Run the repository's local reviewer-agent workflow and record `APPROVED` for the exact diff.
- [ ] Push the release branch and open a release pull request to `main`. Use the repository pull
      request template, link the release issue, and put multiline Markdown in a real file when
      using CLI options such as `--body-file` or `--comment-file`.

### 2. Qualify and approve the candidate

- [ ] Record the release version, full candidate commit SHA, release pull request, candidate
      `Quality` run, `Deploy Preview` run, exact preview URL, and app footer version/build time.
- [ ] Confirm the release-branch `Quality Gate` succeeds.
- [ ] Confirm `Deploy Preview` succeeds for the same candidate SHA, including preview availability
      and the mobile Lighthouse gate. Link its Lighthouse reports.
- [ ] Freeze the shared test preview slot and verify its visible footer identity still matches the
      recorded candidate before starting device QA.
- [ ] Complete every required iOS and Android scenario in
      [`Manual-Device-QA.md`](Manual-Device-QA.md). Only `PASS` in every required row satisfies the
      gate; attach or link the required evidence and passing reruns.
- [ ] Resolve every release pull request conversation and confirm the release notes still match the
      qualified candidate.
- [ ] Obtain and record an explicit `APPROVED FOR RELEASE` decision from the human release owner
      after the automated and physical-device evidence is complete.

### 3. Merge and lock the production target

- [ ] Rebase-merge the release pull request into `main` and delete the remote and local release
      branch.
- [ ] Record the resulting full `main` SHA and confirm that the version in `package.json` still
      matches the planned tag.
- [ ] Confirm the strict `Quality Gate` and `Deploy Preview` (including Lighthouse) succeed for that
      exact `main` SHA.
- [ ] Confirm the main preview exposes the expected version/build identity and release content.
- [ ] Freeze further merges to `main` until the production workflow has selected and deployed this
      exact SHA. If `main` advances, stop and qualify the new target instead of deploying an
      unapproved commit.

### 4. Deploy and verify production

- [ ] Start `Deploy Production` manually from `main` and record its workflow URL. Confirm its
      resolved target SHA equals the locked release SHA.
- [ ] Require the complete workflow to succeed: fresh dependency audit, production build and path
      verification, immutable artifact publication, website-consumer contract check, deterministic
      handoff, production identity smoke check, and production Lighthouse gate.
- [ ] Verify `https://jon2050.de/conspectus/deploy-metadata.json` reports the expected `commitSha`,
      `deployRunId`, `qualityRunId`, `sourceBranch`, and `buildTimeUtc`.
- [ ] Open `https://jon2050.de/conspectus/` and confirm the app shell, manifest, icons, and service
      worker load without path or policy errors and the footer matches the released version and
      deployed build time.
- [ ] On the required physical iOS and Android devices, confirm the installed PWA discovers and
      applies the update, relaunches successfully, and shows the released footer identity.
- [ ] With the dedicated QA Microsoft account and disposable database, smoke sign-in, bound-file
      sync, Accounts, and Transfers on production. Do not use a personal financial database.
- [ ] Run `Post-Deploy Monitor` manually from `main` with `simulate_failure = false`, require a successful
      result for the exact production `commitSha` and `deployRunId`, and link its evidence artifact.
- [ ] Record `PASS` or the linked defect for every post-deploy check. Any failed, blocked, or
      unverified check keeps the release incomplete and triggers the applicable rollback procedure;
      do not publish a successful GitHub Release.

### 5. Tag, publish, and close

- [ ] Create the annotated tag `v<version>` on the exact successfully deployed `main` SHA, verify
      its target locally, and push the tag. Never tag a different or merely planned commit.
- [ ] Publish a GitHub Release from that existing tag using the approved notes. With `gh`, pass the
      multiline notes through `--notes-file`; do not embed escaped `\n` sequences.
- [ ] Link the GitHub Release, tag, production workflow, production Lighthouse reports,
      `deploy-metadata.json` identity, manual-device evidence, and post-deploy evidence in the
      release pull request or release issue.
- [ ] Unfreeze `main`, close the release issue only after every item above passes, and announce any
      retained known limitations.

## Release notes template

Use these headings in the release pull request and the published GitHub Release. Keep issue and
evidence links clickable and use full commit SHAs for candidate and production identity.

```markdown
# Conspectus-Mobile v<version>

## Summary

<Who benefits and what changed.>

## Included changes

- <Milestone/issue link and user-visible or operational result>

## Known limitations

- <Limitation and tracking issue, or "None known.">

## Release evidence

- Release pull request:
- Candidate commit and Quality / Deploy Preview runs:
- Production commit and Deploy Production run:
- Preview and production Lighthouse reports:
- Manual iOS / Android QA evidence:
- Post-deploy verification evidence:
- Production deploy metadata:

## Recovery

- Rollback runbook used for this release:
```

## Failure handling

Stop at the first failed gate. Preserve its logs and evidence, link a defect, fix the root cause on
an appropriate branch, and repeat every checklist item invalidated by the change. A production
workflow can fail after handoff has started, so inspect the live deployment identity and use the
applicable rollback runbook rather than assuming the previous production version is still active.
Do not move a tag, publish a GitHub Release, or describe the release as complete while any required
gate is not green.
