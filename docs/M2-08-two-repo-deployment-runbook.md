# M2-08 Two-Repo Deployment Runbook

Issue: [#27](https://github.com/Jon2050/Conspectus-Mobile/issues/27)
Last Updated: 2026-03-03

This runbook is the operator procedure for deploying and rolling back the Conspectus Mobile PWA in the two-repo setup:

- Producer repo: `Jon2050/Conspectus-Mobile`
- Consumer repo: repository variable `WEBSITE_REPO_FULL_NAME` (default `Jon2050/Jon2050_Webpage`)

Hard rule: use CI automation only. Do not copy files manually to the live website.

## 1. Scope and Trigger Path

This runbook covers only the PWA artifact handoff path (`repository_dispatch`), not the website repo's normal `push` deploy path.

Producer trigger conditions:
1. `Quality` must finish successfully for a `push`.
2. `Deploy Channels` runs from that successful `workflow_run`.
3. Production artifact + dispatch run only when the producer branch is `main`.
4. Dispatch target repo is read from `WEBSITE_REPO_FULL_NAME` (defaults to `Jon2050/Jon2050_Webpage`).

Consumer trigger conditions:
1. Website repo workflow `.github/workflows/deploy.yml` listens to `repository_dispatch` event type `conspectus-mobile-production-ready`.
2. Consumer deploys only from dispatch payload identity fields (no manual artifact selection).

Post-deploy verification trigger:
1. Producer workflow `Website Deploy Smoke` runs after successful `Deploy Channels` runs on `main`.

## 2. Owner Responsibilities

| Owner | Responsibilities |
| --- | --- |
| Producer operator (`Conspectus-Mobile`) | Ensure `Quality` and `Deploy Channels` pass on `main`, ensure dispatch payload identity is correct, and record deploy identity fields. |
| Consumer operator (`WEBSITE_REPO_FULL_NAME` target repo) | Ensure `Deploy to FTP` (`repository_dispatch` run) succeeds, ensure fail-closed behavior is respected on errors, and confirm live promotion completed. |
| Incident owner | Decide rollback trigger, choose known-good deploy identity, execute rollback dispatch replay, and verify live identity after rollback. |

## 3. Contract Fields and Deterministic Identity

Required fields:

| Field | Meaning | Primary source |
| --- | --- | --- |
| `commitSha` | Producer commit that generated the artifact | `deploy-metadata.json`, dispatch payload, producer run data |
| `deployRunId` | Producer `Deploy Channels` run ID that published artifact | `deploy-metadata.json`, dispatch payload |
| `qualityRunId` | Producer `Quality` run ID paired to the deploy run | `deploy-metadata.json`, dispatch payload |
| `artifactName` | Exact artifact name: `conspectus-mobile-production-<commitSha>` | Producer run artifacts + dispatch payload |

Deterministic selection rule:
1. Identify one producer `deployRunId`.
2. List artifacts for that exact run.
3. Select exact `artifactName` from that run.
4. Validate `deploy-metadata.json` identity before publish.
5. Fail closed on any mismatch.

Example commands (PowerShell):

```powershell
# Resolve consumer target repo exactly as producer workflow does.
$ConsumerRepo = gh variable get WEBSITE_REPO_FULL_NAME --repo Jon2050/Conspectus-Mobile 2>$null
if (-not $ConsumerRepo) { $ConsumerRepo = 'Jon2050/Jon2050_Webpage' }

# 1) Find recent producer deploy runs on main.
gh run list --repo Jon2050/Conspectus-Mobile --workflow "Deploy Channels" --branch main --limit 10

# 2) Inspect artifacts of one deploy run.
gh api repos/Jon2050/Conspectus-Mobile/actions/runs/<DEPLOY_RUN_ID>/artifacts --jq '.artifacts[] | {name, expired}'

# 3) Download exact artifact and read deploy identity fields.
New-Item -ItemType Directory -Path .tmp -Force | Out-Null
gh run download <DEPLOY_RUN_ID> --repo Jon2050/Conspectus-Mobile --name <ARTIFACT_NAME> --dir .tmp/m2-08-artifact
Get-Content .tmp/m2-08-artifact/deploy-metadata.json
```

## 4. Standard Production Deploy Procedure (PWA)

1. Merge the PWA change PR into `main` in `Jon2050/Conspectus-Mobile`.
2. Confirm producer `Quality` run is successful for the `main` push.
3. Confirm producer `Deploy Channels` run is successful and includes:
- `Publish Production Artifact` success
- `Dispatch Production Ready` success
4. Confirm consumer `Deploy to FTP` workflow (`repository_dispatch` event) completes successfully in `$ConsumerRepo`.
5. Confirm producer `Website Deploy Smoke` run for the deploy commit is successful.
6. Record deployment identity (`commitSha`, `deployRunId`, `qualityRunId`, `artifactName`) for rollback readiness.

Monitoring commands:

```powershell
# Producer pipeline
gh run list --repo Jon2050/Conspectus-Mobile --workflow Quality --branch main --limit 5
gh run list --repo Jon2050/Conspectus-Mobile --workflow "Deploy Channels" --branch main --limit 5

# Resolve consumer target repo exactly as producer workflow does.
$ConsumerRepo = gh variable get WEBSITE_REPO_FULL_NAME --repo Jon2050/Conspectus-Mobile 2>$null
if (-not $ConsumerRepo) { $ConsumerRepo = 'Jon2050/Jon2050_Webpage' }

# Consumer pipeline: list only repository_dispatch runs to avoid push-run ambiguity.
gh run list --repo $ConsumerRepo --workflow "Deploy to FTP" --limit 20 `
  --json databaseId,event,status,conclusion,displayTitle,createdAt `
  --jq '.[] | select(.event=="repository_dispatch")'

$WebsiteRunId = gh run list --repo $ConsumerRepo --workflow "Deploy to FTP" --limit 20 `
  --json databaseId,event --jq '.[] | select(.event=="repository_dispatch") | .databaseId' `
  | Select-Object -First 1

gh run watch $WebsiteRunId --repo $ConsumerRepo
```

## 5. PWA-Only Hotfix Procedure

Use this when only `conspectus/webapp` needs a correction.

1. Create and merge a focused hotfix PR in `Jon2050/Conspectus-Mobile` (do not push website repo code changes for this path).
2. Let the normal producer `main` flow dispatch artifact identity to the consumer.
3. Verify using the same checks as standard deploy (producer runs + consumer run + website smoke checks).

Reason this avoids full website regression:
1. The consumer PWA job deploys only the `conspectus/webapp` subtree.
2. Website non-PWA content is not selected as deployment input for this path.

## 6. Rollback Procedure (Automation Only)

Trigger rollback when any of these hold:
1. Production smoke checks fail for the new deployment.
2. Critical user-facing regression is confirmed in deployed PWA.
3. Post-deploy validation shows wrong identity or artifact mismatch.

Rollback steps:
1. Select last known-good deployment identity (`commitSha`, `deployRunId`, `qualityRunId`, `artifactName`).
2. Replay the consumer dispatch event with that exact identity payload.
3. Monitor the consumer run to completion.
4. Verify live identity with `scripts/verify-production-deploy-smoke.mjs`.

Dispatch replay example (PowerShell):

```powershell
New-Item -ItemType Directory -Path .tmp -Force | Out-Null

@'
{
  "event_type": "conspectus-mobile-production-ready",
  "client_payload": {
    "commitSha": "<KNOWN_GOOD_COMMIT_SHA>",
    "deployRunId": "<KNOWN_GOOD_DEPLOY_RUN_ID>",
    "qualityRunId": "<KNOWN_GOOD_QUALITY_RUN_ID>",
    "artifactName": "<KNOWN_GOOD_ARTIFACT_NAME>"
  }
}
'@ | Set-Content .tmp/m2-08-rollback-dispatch.json

$ConsumerRepo = gh variable get WEBSITE_REPO_FULL_NAME --repo Jon2050/Conspectus-Mobile 2>$null
if (-not $ConsumerRepo) { $ConsumerRepo = 'Jon2050/Jon2050_Webpage' }

gh api repos/$ConsumerRepo/dispatches `
  --method POST `
  --input .tmp/m2-08-rollback-dispatch.json
```

Live verification example (local):

```powershell
node scripts/verify-production-deploy-smoke.mjs `
  --base-url "https://jon2050.de/conspectus/webapp/" `
  --commit-sha "<KNOWN_GOOD_COMMIT_SHA>" `
  --deploy-run-id "<KNOWN_GOOD_DEPLOY_RUN_ID>"
```

Manual copy prohibition:
1. Do not copy extracted artifact files into the live website filesystem.
2. Do not bypass CI promotion steps.
3. Use dispatch-driven deployment only.

## 7. Required Credentials and Permissions

| Secret / token | Location | Minimum permission expectation |
| --- | --- | --- |
| `WEBSITE_REPO_DISPATCH_TOKEN` | Producer repo secrets (`Conspectus-Mobile`) | Ability to call `POST /repos/<website-repo>/dispatches` for `WEBSITE_REPO_FULL_NAME` target (default `Jon2050/Jon2050_Webpage`). |
| `CONSPECTUS_MOBILE_ARTIFACT_TOKEN` | Consumer repo secrets (target repo from `WEBSITE_REPO_FULL_NAME`) | `actions:read` access to `Jon2050/Conspectus-Mobile` Actions artifacts. |

If token validation fails, deployment must fail closed without live-file mutation.

## 8. Failure Handling Expectations (Fail Closed)

| Failure point | Expected behavior | Operator action |
| --- | --- | --- |
| Producer artifact generation fails | No consumer dispatch occurs | Fix producer issue and redeploy from producer `main` flow. |
| Producer dispatch fails | Consumer deployment not started | Fix dispatch token/permissions and rerun dispatch path. |
| Consumer run identity/artifact lookup mismatch | Consumer exits with failure before publish | Correct payload identity fields and replay dispatch. |
| Consumer metadata validation fails | Consumer exits with failure before publish | Use correct known-good payload and retry. |
| Consumer promotion fails | Consumer attempts rollback of remote promotion and fails run | Investigate consumer logs and retry dispatch when safe. |
| Post-deploy smoke fails | Deployment considered bad | Execute rollback dispatch replay with known-good identity. |

## 9. Operator Completion Checklist

1. Deployed commit and run identity captured (`commitSha`, `deployRunId`, `qualityRunId`, `artifactName`).
2. Producer `Quality` and `Deploy Channels` are green for the deployment event.
3. Consumer `Deploy to FTP` `repository_dispatch` run is green.
4. Smoke verification is green (`Website Deploy Smoke` or manual script check for rollback replay).
5. Rollback payload file for last known-good deployment can be reconstructed from recorded identity fields.
