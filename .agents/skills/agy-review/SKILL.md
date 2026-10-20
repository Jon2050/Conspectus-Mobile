---
name: agy-review
description: Review Conspectus-Mobile code changes or implementation plans with the Antigravity CLI (agy), checking correctness, architecture, data safety, and maintainability. Use for requested agy or external reviews and as a supplement to an independent code or plan review.
---

# Agy Review for Conspectus-Mobile

Use Antigravity as an additional reviewer. Perform your own source or plan review first and
evaluate its findings independently. External findings are engineering input, not proof of
correctness or release approval.

Repository links below are relative to this skill directory. Resolve CLI paths from the repository
root. Follow [AGENTS.md](../../../AGENTS.md), [README.md](../../../README.md),
[architecture](../../../docs/ARCHITECTURE.md), and
[contribution workflow](../../../docs/CONTRIBUTING.md).

## Scope and mode

Infer the target and acceptance criteria from the request and Git state. Ask only when ambiguity
would materially change the review target.

- **Code review:** Record the base/head commit IDs and which committed, staged, unstaged, and
  relevant untracked changes are included. Review the selected changes and their direct effects.
  Apply the criteria and verdict rules in the canonical
  [code-review prompt](../../../docs/prompts/Code-Review-Prompt-Template.md).
- **Plan review:** Identify the supplied plan file or text, its requirements, and the current
  source revision it assumes. Check feasibility against existing code, ownership boundaries,
  sequencing, failure handling, verification, and explicit non-goals. Review proposed behavior
  rather than demanding an implementation or test results that cannot exist yet.
- A review-only request stays read-only. An implementation task that includes review may include
  fixes within its already authorized scope. A plan review does not authorize implementation.

Do not run tests, builds, formatters, installs, or application commands as part of a read-only
review. Inspect existing evidence and state its revision and limitations. The external reviewer
must always remain read-only, including during an authorized implementation loop.

## Prepare an isolated review snapshot

`--mode plan` and a read-only prompt are not filesystem protection. Never launch the external
reviewer inside the user's checkout. Use a fresh disposable snapshot under the system temporary
directory, with a unique task path and no link back to the original Git directory.

1. Inspect `git status --short`, the relevant diffs, refs, and selected untracked paths in the
   original repository without switching branches, stashing, or changing the index.
2. Create an independent local Git clone with `--no-hardlinks` and without alternates or a shared
   Git directory. Ensure the chosen base and head commits exist in the clone. Remove its remote
   so an accidental push cannot reach the source checkout. Do not use `git worktree`, `--shared`,
   symlinks, junctions, or `--add-dir` to expose the original checkout.
3. For a working-tree target, reproduce the selected staged and unstaged changes separately in
   the snapshot, including deletions, renames, and binary changes. Binary-capable Git patches
   applied to the index first and working tree second are suitable. Explicitly copy only the
   relevant, inspected untracked files. For a commit-only target, use the exact selected commit.
4. Include the required project documents and the plan when applicable. Save chat-only plan text
   as an explicit review input in the snapshot. Keep it separate from the code-change diff.
   Include sanitized task requirements and existing verification summaries when needed.
5. Compare the snapshot's scoped status and diffs with the original. Record any intentional
   exclusions. Do not silently omit new files, staged-only changes, or the target plan.
6. Exclude `.env`, credentials, tokens, personal SQLite files, receipt images, private logs,
   browser profiles, `node_modules/`, generated output, and unrelated files. Inspect tracked
   content too: a Git clone is not a sanitizer. If sensitive tracked content exists, prepare a
   sanitized independent repository before invocation. Public schema and synthetic fixtures may
   be included when relevant. Do not pass secrets through prompts or command arguments.

The isolated directory limits accidental changes; it is not a security sandbox. Use available
host restrictions and comply with actual execution/transmission permissions. The desktop
Conspectus project's standing authorization and `.codex` allow rules do not apply here. This skill
does not create permission rules or authorize publishing GitHub reviews, commits, or deployments.

Before invocation, record the snapshot's status and diff baseline. After each call, inspect it for
unexpected mutations; if any occur, stop that session, discard its changed artifacts, and recreate
the snapshot from the original target. Never copy external edits back into the real checkout.
Do not recursively delete a temporary path unless its resolved location is verified as the
specific disposable directory created for this review.

## Select and invoke the reviewer

Check the installed `agy --help` and run `agy models` from the isolated directory. Select the
latest suitable available `-high` model and use `--effort high`; record the exact model ID. If that
selection is ambiguous, use the listing's supported model metadata rather than guessing from
names. If discovery fails, use an explicitly configured, verified available model or report the
external review as unavailable. Do not silently fall back to a historical model ID.

Read [the prompt templates](references/review-prompts.md) and fill in the selected mode, exact
scope, task requirements, optional extra focus, and evidence. Let the reviewer inspect the isolated
repository directly; do not paste a large diff into the prompt.

Run from the snapshot directory in PowerShell, using a prompt variable containing actual newlines:

```powershell
agy --mode plan --model <MODEL-ID> --effort high --print-timeout 15m -p $reviewPrompt
```

Keep `--mode plan` immediately after `agy`. Never use edit modes or
`--dangerously-skip-permissions`. A timeout, tool failure, or incomplete answer is an incomplete
review, not an approval. Do not run an external review just to validate installation of this skill.

## Triage and optional re-review

Evaluate every finding against source and requirements: **Accept**, **Partial**, or **Reject**, with
evidence and a technical rationale. Separate pre-existing incidental observations from defects in
the target. Do not create backlog entries, change issues, or expand scope because the reviewer
suggests it. Missing review context is a limitation; missing required implementation evidence may
block approval under the canonical review criteria.

For a review-only task, return findings without changing code or plans. For an already authorized
implementation or plan-editing task:

1. Apply accepted, in-scope fixes yourself in the original checkout; preserve unrelated changes.
2. Run proportionate validation for those edits. For code, consult README and CONTRIBUTING for
   `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`;
   browser/PWA/auth/sync changes also require appropriate `npm run test:e2e` coverage. Dependency,
   bundle, and release checks apply only to their affected surfaces. Documentation-only edits
   need relevant formatting/reference checks. Plan-only edits do not require application tests.
3. Refresh and verify the isolated snapshot from the updated target before re-review. Do not layer
   changes onto a snapshot the reviewer altered.
4. Prefer `--conversation <ID>` when a review conversation ID is available. Otherwise use `-c`
   only if the most recent session is verified to be this review. Keep the same model and effort:

   ```powershell
   agy --mode plan --conversation <REVIEW-ID> --model <MODEL-ID> --effort high --print-timeout 15m -p $followupPrompt
   ```

5. Re-review accepted fixes and report only unresolved or new findings. Stop when blocking findings
   are resolved or a justified exception remains explicit. If three cycles fail to converge,
   report the unresolved issue; ask for direction only if an actual user decision is required.

## Final report

State the mode, reviewed target/revision, model, completed review rounds, and limitations. Report
findings with P0–P3 priorities, original-repository file/line locations (or plan sections), impact,
and disposition/evidence. Include an explicit maintainability assessment of the most complex
changed or proposed flow, even if no correctness bug was found.

Distinguish your conclusions from the external review. List checks actually run and checks not
run; do not imply static review verified runtime behavior, physical devices, Microsoft sign-in,
OneDrive writes, or deployment. For code reviews, use the canonical output format and finish with
`APPROVED` or `NOT APPROVED`. For plan reviews, use the same verdict vocabulary to describe
readiness of the plan, explicitly separate from implementation acceptance or release approval.
