# Repository Guidance for AI Agents

This file gives durable operating guidance for AI coding agents working in this repository.
Use `README.md` as the human-facing project entry point and source for setup, commands, and module
layout. Use `docs/CONTRIBUTING.md` for the contribution and delivery workflow.

## Before Editing

- Read the task, `README.md`, this file, and any task-relevant architecture, backlog,
  module, or runbook documents before changing files.
- For work that is non-trivial, ambiguous, risky, or multi-step, create a concrete plan
  before editing. The plan should name the intended files or areas, verification steps, and
  assumptions.
- Keep the working tree safe. Do not revert, overwrite, or clean up unrelated user changes.

## Scope Control

- Keep changes limited to the task. Do not modify application code, configuration, CI,
  generated output, backlog status, or unrelated documentation unless the task requires it.
- Prefer existing module boundaries, helper APIs, naming patterns, and test utilities over new
  abstractions.
- Do not invent product behavior, workflow rules, environment variables, Graph scopes, or
  deployment requirements.
- Keep generated folders such as `dist/`, `playwright-report/`, and `test-results/` out of
  review unless the task explicitly updates artifacts.

## Architecture Expectations

- Source code is organized under `src/` by module: `auth`, `graph`, `db`, `cache`,
  `features`, and `shared`.
- Cross-module imports use module-root aliases such as `@auth`, `@graph`, `@db`, `@cache`,
  `@features`, and `@shared`; relative imports are for files inside the same module.
- Respect the dependency direction enforced by ESLint. Lower-level modules must not import
  feature UI or unrelated infrastructure.
- Auth and OneDrive behavior are configuration-sensitive. When changing environment variables,
  redirect URIs, Graph scopes, or sync/write behavior, update the canonical documentation named
  in the README documentation map.

## Verification

- Choose verification that matches the risk and surface area of the change. For code changes,
  the usual local gate is `npm run format`, `npm run lint`, `npm run typecheck`,
  `npm run test`, `npm run build`, and `npm run test:e2e` when browser behavior is relevant.
- Add or update focused tests beside changed behavior. Use `src/shared/testUtils/` when an
  existing helper fits.
- For documentation-only changes, run the relevant formatting or reference checks that are
  available and practical.
- Never claim a command, test, check, or manual verification passed unless you actually ran it.
  State anything not tested.

## Delivery Report

Finish each task with a concise report that covers:

- your understanding of the task;
- changed files;
- relevant design or ownership decisions;
- the achieved result;
- commands, tests, and checks run, with results;
- what was not tested;
- remaining risks, open questions, assumptions, or follow-up work.
