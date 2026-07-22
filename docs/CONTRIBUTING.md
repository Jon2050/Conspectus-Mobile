# Contributing

This guide defines the durable contribution workflow for Conspectus-Mobile. It applies to human
contributors and to work performed with coding agents. Historical MVP orchestration instructions
are preserved in [`archive/workflows/Human-Workflow.md`](archive/workflows/Human-Workflow.md).

## Before starting

1. Read the task or GitHub issue, the repository [`README.md`](../README.md), and [`AGENTS.md`](../AGENTS.md).
2. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) and any topic-specific document named in its
   documentation ownership table.
3. Inspect the current working tree and preserve unrelated user changes.
4. For non-trivial, ambiguous, risky, or multi-step work, write a concrete plan before editing.
5. Confirm prerequisites and acceptance criteria from the GitHub issue or task rather than
   inferring new product behavior.

`README.md` is the setup and command entry point. `AGENTS.md` contains repository-specific rules
for coding agents. This document owns the human-facing contribution and delivery workflow.

## Issues

Use the templates in [`.github/ISSUE_TEMPLATE`](../.github/ISSUE_TEMPLATE/) when creating an issue.
Describe observable acceptance criteria, relevant edge cases, dependencies, risks, and the intended
verification.

Use exactly one primary label:

- `feature`: user-visible functionality or behavior changes;
- `infra`: repository, CI/CD, tooling, workflow, or deployment work;
- `bug`: incorrect current behavior;
- `docs`: documentation-only work;
- `test`: automated test work or QA harness improvements;
- `security`: security, authentication hardening, scopes, headers, or dependency risk mitigation.

If work spans several areas, choose the dominant type and describe secondary concerns in the issue.
Detailed implementation decisions belong in the pull request when they are discovered during the
work.

## Branches and scope

- Use a dedicated branch for each issue or coherent task.
- Include the issue or task identifier when one exists, for example
  `feature/M5-07-localize-formatting` or `bug/123-fix-sync-state`.
- Keep changes limited to the task. Do not combine unrelated cleanup with feature delivery.
- Prefer established module boundaries, public APIs, helpers, naming, and test utilities.
- Update canonical documentation only when its owned contract changes.
- Keep generated output such as `dist/`, `playwright-report/`, and `test-results/` out of review.

## Implementation and verification

Add or update focused tests beside changed behavior. Use shared fixtures and test utilities when
they already cover the required setup.

Choose verification according to the affected surface. The normal code gate is:

```sh
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

Also run:

- `npm run test:e2e` when browser, PWA, routing, authentication, synchronization, or user-visible
  behavior is affected;
- `npm run audit:dependencies` for dependency or release work;
- `npm run check:bundle-size` after a production build when bundle-sensitive code changes;
- the relevant deployed-route or manual QA checks when a release or deployment contract changes.

Documentation-only changes need the applicable formatting and link/reference checks, not an
automatic full application test run. Never report a check as passing unless it was actually run.

## Commits

- Write a concise, imperative commit summary that describes the delivered result.
- Include the issue identifier in the summary when the work belongs to an issue, for example
  `feat: [M5-07] add localized formatting`.
- Every commit message must include an `Agent:` trailer. The commit hook enforces this for human and
  agent-authored commits alike. Use `Agent: None` when no coding agent contributed.
- Keep commits scoped and do not hide unrelated changes in the same commit.

Example:

```text
docs: add durable contribution workflow

Agent: Codex
```

## Pull requests and review

1. Use [`.github/pull_request_template.md`](../.github/pull_request_template.md).
2. Link the issue when the work has one and describe the problem, result, verification, risks, and
   assumptions.
3. Include screenshots or recordings for material UI changes.
4. Confirm that local checks appropriate to the change pass before pushing.
5. Resolve review findings and rerun every check invalidated by the fix.
6. Wait for required GitHub checks to pass before merging.

Changes reach `main` through a pull request. Use **Rebase and merge** to retain linear history, then
delete the head branch. Do not close the issue or describe the work as complete until the merged
commit and its required checks are green.

## Working with coding agents

- Give the agent the task, acceptance criteria, and relevant constraints; do not rely on an old
  milestone-specific prompt as project truth.
- Review plans for non-trivial work and challenge assumptions that alter product or operational
  behavior.
- Keep approval for external publication, production deployment, release acceptance, and other
  consequential actions with the responsible human unless explicitly delegated.
- Require the agent to preserve unrelated working-tree changes and report exactly what it changed
  and verified.
- Use [`prompts/Code-Review-Prompt-Template.md`](prompts/Code-Review-Prompt-Template.md) for an
  independent local change review or GitHub pull-request review.
- Treat agent reviews as engineering input. They do not replace required human ownership or release
  approval.

## Releases

Production releases follow only the canonical checklist in
[`Release-Process.md`](Release-Process.md). Do not maintain a second release checklist here or in an
agent prompt.

The human release owner must:

- coordinate the shared non-`main` preview test window;
- review the physical-device evidence required by
  [`Manual-Device-QA.md`](Manual-Device-QA.md);
- record `APPROVED FOR RELEASE` for the exact qualified candidate;
- start `Deploy Production` manually from the approved `main` commit;
- verify production identity and post-deploy evidence before publishing the tag and GitHub Release.

Rollback execution follows [`Production-Rollback.md`](Production-Rollback.md).

## Completion report

Finish each task with a concise record of:

- the understood scope and achieved result;
- changed files and important ownership or design decisions;
- commands and checks run, with their results;
- checks not run and why;
- remaining risks, assumptions, open questions, or follow-up work.
