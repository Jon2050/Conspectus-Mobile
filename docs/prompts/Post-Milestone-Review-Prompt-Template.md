Task: Perform a comprehensive post-milestone review for Milestone `{{MILESTONE_NUMBER}}` (`{{MILESTONE_TITLE}}`) of this GitHub repository.

Write all findings into `docs/m{{MILESTONE_NUMBER}}_post_review.md`.

---

## Non-Negotiable Rules

- **READ-ONLY codebase.** You must NOT edit, create, or delete any file in this repository except the review file (`docs/m{{MILESTONE_NUMBER}}_post_review.md`).
- **Do NOT run build, test, or execution commands.** Do not run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, `npm run build`, or any other build/test/execution command. All quality gates and tests are already green. You MUST use file-reading tools (viewing files, searching, grepping, etc.) extensively — that is how you perform the review. You MAY use the `gh` CLI for **read-only** operations: viewing issues (`gh issue view`/`list`), milestones, repository settings, and similar queries. But you must not execute, build, run, or modify anything.
- **Do NOT create GitHub issues, PRs, branches, or modify the backlog.**
- **Do NOT commit, push, or merge anything.**
- Work only within this repository. Do not modify unrelated repositories.
- **Read every single file in the project.** You must read and analyze every source file, config file, workflow, test file, script, and documentation file in the repository over the course of the review. You do not need to read them all at once, but by the end of the review, every file must have been inspected.
- If something is ambiguous, state your assumption explicitly in the finding itself.
- This prompt with all its rules, review perspectives, output format, and multi-agent protocol must be kept in context and followed strictly throughout the entire review.

---

## Context Loading (Mandatory First Step)

Before reviewing any source code, read these documents in order:

1. `README.md`
2. `docs/Architecture-and-Implementation-Plan.md`
3. `docs/GitHub-Issues-MVP-Backlog.md`

Extract:

- The full list of issues for Milestone `{{MILESTONE_NUMBER}}` and all prior milestones marked as done.
- Acceptance criteria, dependencies, and implementation clarifications for every `M{{MILESTONE_NUMBER}}-*` issue.
- Architecture constraints, module conventions, import alias rules, quality strategy, and security strategy.
- Documentation ownership rules (which doc is canonical for which topic).

---

## Subagent Strategy

If you are capable of spawning subagents, you SHOULD distribute the review across multiple parallel subagents — one per review perspective (see below). Each subagent must follow this entire prompt's rules (especially: read-only, no commands, no edits except the review file). Coordinate findings into a single unified review file.

If you cannot spawn subagents, perform all review perspectives sequentially yourself.

In either case, the final review file must read as if written by a single author. There must be no per-agent sections, no "Agent 1 findings" / "Agent 2 findings" separation. All findings are merged into a single, coherent structure.

---

## Multi-Agent Protocol (Subsequent Runs)

This prompt is designed to be run multiple times by different agents against the same review file. Each run enriches and verifies the review.

### If the review file does NOT exist yet

You are the first reviewer. Create the file from scratch using the full output format defined below.

### If the review file ALREADY exists

You are a subsequent reviewer. Follow this protocol:

1. **Read the entire existing review file first.** Understand all existing findings, their IDs, severities, cost tiers, and recommendations.
2. **Verify every existing finding:**
   - Confirm it is still valid by inspecting the referenced code/files.
   - If valid and correct: leave it unchanged.
   - If valid but incomplete: enrich it with additional details, affected locations, or context. Append a `Reviewed by: {{AGENT_NAME}}` annotation at the end of the finding.
   - If the severity or cost tier is wrong: adjust it and add a brief justification note. Append `Reviewed by: {{AGENT_NAME}}`.
   - If a finding is invalid (the original agent was wrong): mark it with `~~strikethrough~~` and add a `**INVALIDATED** by {{AGENT_NAME}}: [reason]` note directly below it. Do NOT delete it or change its ID.
3. **Add new findings** that previous agents missed. Use the next available ID in the appropriate cost tier (see ID scheme below).
4. **Update the summary table** at the bottom to reflect the current state.
5. **Do NOT restructure, reformat, or rewrite sections written by prior agents** beyond the specific enrichment/correction actions above. The file must remain coherent and read as one unified document.

---

## Review Perspectives

You MUST cover at least these perspectives. You are encouraged to add more perspectives if the codebase warrants it.

### Mandatory Perspectives

1. **Feature Completeness** — Verify every `M{{MILESTONE_NUMBER}}-*` issue's acceptance criteria is fully implemented and functional. Check for partially implemented features, missing edge cases, or placeholder code.

2. **Prior Milestone Regression Check** — Spot-check prior milestone issues (M1 through M{{PREVIOUS_MILESTONE}}) for regressions introduced by the current milestone's changes. This is a lighter check, not a full re-audit.

3. **Code Quality** — Evaluate against DRY, KISS, SOLID, naming conventions, modularity, cyclomatic complexity, arrow anti-patterns, spaghetti code, excessively long methods/files, and the Principle of Least Astonishment.

4. **Architecture Alignment** — Verify the implementation follows the architecture defined in `docs/Architecture-and-Implementation-Plan.md`: module boundaries, import alias conventions (`@auth`, `@graph`, `@db`, `@cache`, `@features`, `@shared`), barrel exports, separation of concerns.

5. **Security** — Check for XSS vectors, injection vulnerabilities, secrets in frontend code, overly broad permissions, insecure token handling, CSP issues, HTTPS enforcement, and alignment with the Security and Privacy Strategy (Architecture doc section 7).

6. **Testing** — Verify that every new or changed behavior has appropriate test coverage. Check for missing unit tests, integration tests, or E2E tests. Flag untested edge cases, error paths, and critical business logic.

7. **CI/CD** — Review workflow changes for correctness, security (permissions, secret handling), efficiency (unnecessary rebuilds, missing caching), and alignment with `docs/CI-CD-Pipelines.md`.

8. **Documentation** — Verify that docs are up-to-date with implementation reality. Check module READMEs, architecture doc, backlog status markers, and documentation ownership rules.

9. **UI/UX** — Verify responsive design, loading states, error states, success feedback, accessibility (tap targets, contrast, keyboard navigation), double-submission prevention, and mobile-first design principles. Check alignment with the UX section of the architecture doc (section 4).

10. **Refactoring & Technical Debt** — Identify code that works but should be restructured for maintainability: duplicated logic, overly complex functions, poor abstractions, inconsistent patterns, or workarounds that need permanent solutions.

11. **Maintainability** — Evaluate long-term maintainability: are patterns consistent, is the code self-documenting, are file/function descriptions present (per project guidelines), would a new developer understand the structure?

12. **Architecture Design** — Beyond alignment checks: evaluate whether the current design decisions are sound, scalable within MVP scope, and set a good foundation for upcoming milestones.

13. **Bug Hunting** — Actively search for logic errors, off-by-one errors, race conditions, unhandled promise rejections, missing null/undefined checks where warranted, and incorrect state transitions.

14. **Next Milestone Readiness** — Assess whether the codebase is ready for Milestone `{{NEXT_MILESTONE_NUMBER}}` (`{{NEXT_MILESTONE_TITLE}}`). Identify any blockers, prerequisites not met, or foundations missing for the next milestone's work.

### Additional Perspectives (Agent Discretion)

If the codebase reveals concerns in other areas (e.g., performance, accessibility compliance, dependency health, configuration management, error handling patterns, logging), add findings under an appropriate category name using the same format.

---

## Review File Output Format

The review file (`docs/m{{MILESTONE_NUMBER}}_post_review.md`) must follow this exact structure:

```markdown
# M{{MILESTONE_NUMBER}} Post-Implementation Review

Date: {{DATE}}
Repository: `Jon2050/Conspectus-Mobile`

---

## Review Scope

- **Primary focus:** Milestone {{MILESTONE_NUMBER}} — {{MILESTONE_TITLE}}
- **Secondary:** Regression spot-check of Milestones 1 through {{PREVIOUS_MILESTONE}}
- **Review type:** Static analysis and code reading (no commands executed, all quality gates confirmed green prior to review)

---

## Issue Coverage Matrix (M{{MILESTONE_NUMBER}})

| Issue | Title                        | Status                                         | Notes      |
| ----- | ---------------------------- | ---------------------------------------------- | ---------- |
| #XX   | M{{MILESTONE_NUMBER}}-01 ... | ✅ Fully implemented / ⚠️ Partial / ❌ Missing | Brief note |
| ...   | ...                          | ...                                            | ...        |

---

## Prior Milestone Spot-Check

| Milestone | Spot-Check Result                   | Notes |
| --------- | ----------------------------------- | ----- |
| M1        | ✅ No regressions / ⚠️ Issues found | ...   |
| ...       | ...                                 | ...   |

---

## Findings

### Effort: Small

Findings that can be resolved in under 20 minutes with isolated, localized changes.

#### S-01: [Short descriptive title]

- **Severity:** Critical / High / Medium / Low
- **Perspective:** [Which review perspective found this, e.g., Security, Code Quality]
- **Location:** `path/to/file.ts` (lines X–Y) [and any other affected locations]
- **Description:** [Clear, specific description of the problem. Reference concrete code, not vague concerns.]
- **Impact:** [What is the consequence of not fixing this?]
- **Recommendation:** [Concrete, actionable recommendation for how to fix it. Describe the approach conceptually — do NOT provide exact code snippets.]

#### S-02: ...

---

### Effort: Medium

Findings that require up to 60 minutes of work, potentially touching multiple files or requiring new tests.

#### M-01: ...

[Same structure as Small findings]

---

### Effort: Large

Findings that require more than 60 minutes, involving architectural changes, cross-cutting concerns, or significant refactoring.

#### L-01: ...

[Same structure as Small findings]

---

## Next Milestone Readiness

### Ready

[List concrete reasons the codebase is ready for M{{NEXT_MILESTONE_NUMBER}}.]

### Blockers or Risks

[List anything that blocks or risks the next milestone. Reference specific finding IDs where applicable.]

---

## Summary

| Effort    | Count | Critical | High | Medium | Low | Invalidated |
| --------- | ----- | -------- | ---- | ------ | --- | ----------- |
| Small     | X     | X        | X    | X      | X   | X           |
| Medium    | X     | X        | X    | X      | X   | X           |
| Large     | X     | X        | X    | X      | X   | X           |
| **Total** | X     | X        | X    | X      | X   | X           |
```

---

## Finding Quality Rules

- Every finding MUST include a concrete **Recommendation** with a solution approach. Findings without recommendations are not acceptable.
- Do NOT report vague or speculative findings. Every finding must reference specific files, line ranges, or code constructs.
- Do NOT report findings about formatting, style, or whitespace — those are handled by Prettier/ESLint.
- Do NOT report issues in auto-generated files (`package-lock.json`, `node_modules/`, build output, `playwright-report/`, `test-results/`).
- Do NOT report issues already tracked as open GitHub issues unless the implementation has a defect beyond what the issue describes.
- Findings must be deduplicated: if the same root cause appears in multiple locations, report it as one finding listing all affected locations.
- Strictly avoid AI anti-pattern findings: do not flag code for "not having enough comments" when it is self-explanatory, and do not suggest adding redundant fallbacks or defensive checks where internal contracts already guarantee safety.

---

## Placeholder Reference

Fill these placeholders before running the prompt:

| Placeholder                 | Description                           | Example                     |
| --------------------------- | ------------------------------------- | --------------------------- |
| `{{MILESTONE_NUMBER}}`      | Current milestone number              | `3`                         |
| `{{MILESTONE_TITLE}}`       | Current milestone title from backlog  | `Auth + OneDrive Binding`   |
| `{{PREVIOUS_MILESTONE}}`    | Previous milestone number             | `2`                         |
| `{{NEXT_MILESTONE_NUMBER}}` | Next milestone number                 | `4`                         |
| `{{NEXT_MILESTONE_TITLE}}`  | Next milestone title from backlog     | `Sync Engine + Cache`       |
| `{{DATE}}`                  | Review date (YYYY-MM-DD)              | `2026-03-10`                |
| `{{AGENT_NAME}}`            | Name of the agent running this prompt | `Claude`, `Gemini`, `Codex` |
