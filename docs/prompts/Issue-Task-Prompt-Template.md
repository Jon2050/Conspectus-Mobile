# Issue Task Prompt Template

This template guides a coding agent through delivery of an existing GitHub issue. It supplements,
but does not replace, `AGENTS.md`, `docs/CONTRIBUTING.md`, and the issue's acceptance criteria. Use
it only when the task explicitly delegates any required publication, merge, or issue-state changes.

Task: Implement the issue `{{TASK_ID}}` end-to-end with full verification.

## Non-negotiable rules:

- Work only in this repository; do not modify unrelated files.
- If requirements are ambiguous, infer from architecture/backlog docs and state assumptions explicitly.
- Use web research when needed (framework/tool questions or blockers).
- Ask questions to the user only for unresolved blockers or if something important is really unclear. Also if there are steps that definitely cannot be done by you.
- Keep changes minimal but fully sufficient for all acceptance criteria.
- DO NOT merge into main, close an issue in GitHub or mark it as done if not everything is done. Even if there are only tasks left for the user.
- DO NOT let subagents push commits or merge pull requests. That must be done by you. Tell the subagents that they are not allowed to push commits or merge pull requests.
- Push code ONLY if ALL local verification gate steps are green.
- For GitHub issue/PR comments, always use `--body-file`/`--comment-file` with real multiline Markdown (never `\n` escapes in quoted strings).
- This prompt with Non-negotiable rules, Execution workflow, Execution Scenarios, Assumptions and Defaults, Quality and Guidelines must always be kept in context and followed strictly. You have to remember this prompt for the whole task.

## Execution workflow:

Always print in which step you are!

1. Load context from:
   - `README.md`
   - `docs/ARCHITECTURE.md`
   - `docs/prompts/CONTRIBUTING.md`
   - `docs/Conspectus-Desktop-Info.md`
   - `docs/GitHub-Issues-Backlog.md`
     Then locate the task by its id on GitHub and extract implementation steps, acceptance criteria, and dependencies/constraints. Also from the comments on GitHub.
2. Plan with one planning subagent. Refine until concrete, testable, and mapped from each acceptance criterion to file-level code/test changes. Make clear, that the planning subagent should not write any code, just the plan.
3. Create/use a dedicated issue branch with a proper name containing the milestone and issue number (e.g., `feature/M6-03-localize-formatting` or `bug/M6-03-fix-locale`).
   3.1. Increase the app version in `package.json` to `0.<milestone_number>.<issue_title_number>`. (e.g. `0.6.03` for issue `M6-03`)
4. Implement the approved plan or findings by a reviewer. Keep commits scoped to this issue. Add/update tests for behavior changes.
5. Run local verification gate:
   - `npm run format`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `npm run test:e2e` when changed behavior is e2e-relevant.
     Fix any issues found during the verification gate before proceeding with step 5.
6. Run the review gate with one reviewer subagent against the acceptance criteria and code review best practices. Use `docs/prompts/Code-Review-Prompt-Template.md` in `local` mode and replace every configuration placeholder with the current branch/diff, issue, context files, and reviewer identity. If gaps are found and the reviewer subagent does not return `APPROVED`, fix the issues it found and repeat steps 4-6 (if the reviewer found problems with the task itself and the acceptance criteria) or 5-6 (if it found only other problems) until satisfied.
7. Git + GitHub flow:
   - At this point, all local checks and tests must be green and the reviewer subagent must have APPROVED the current diff. If not, go back to step 6.
   - Update the backlog status marker for this issue in `docs/GitHub-Issues-Backlog.md` to done (`:white_check_mark:`) so that it is included in the issue branch commits.
   - Open a PR to `main` from the issue branch (direct-main is not allowed for issue delivery). The PR title and description MUST explicitly contain the milestone and issue number (e.g., `feat: [M5-07] Add formatting utilities`). Link the issue (for example: `Closes #<issue-id>`)
   - Use a clear commit message referencing the issue and acceptance criteria mapping. Every commit message belonging to a backlog issue MUST start with the issue prefix in the summary (e.g., `feat: [M5-07] add formatting utility`).
   - Commit and push.
8. CI gate: wait for required GitHub checks to pass. If any check fails, fix and repeat from step 4.
9. Completion (Note: If the PR merge is delayed/asynchronous and your turn ends, the very first step upon resuming or in any follow-up task after the merge is to complete this checklist):
   - Merge the PR to `main` (or verify it has been merged), then delete the remote head branch. Checkout and pull the latest `main` branch locally and delete the local head branch.
   - Mark the issue as done in GitHub. Also add a brief comment with a summary of what you did and why. Also mention if you made any assumptions or any problems you encountered. Comment must be well formatted.
   - Verify that `docs/GitHub-Issues-Backlog.md` status marker is updated to done (`:white_check_mark:`) on the merged `main` branch.
   - Update `docs/ARCHITECTURE.md` only when the issue changes a durable architecture decision,
     runtime flow, ownership boundary, or safety invariant. Keep issue completion notes and release
     evidence in GitHub or the appropriate archive instead. Do not alter unrelated sections.
   - Provide final report with changed files, commands/results, CI status, acceptance criteria checklist, and assumptions.
     You are not fully done before step 9 is not completed and all CI pipelines, checks and tests are green. You have to confirm this always after every push or merge!

## Execution Scenarios (Strict Handling)

- **Happy Path:** Implementation complete -> Local checks pass -> Local reviewer agent pass -> Commit -> Push -> CI passes -> PR merged -> Issue marked done.
- **Local Check or CI Failure:** STOP progression immediately. Inspect logs, fix the root cause, and re-run the FULL verification gate before pushing again.
- **Review Gaps:** Fix requested changes, re-run local checks, and re-submit for review.
- **Requirement Ambiguity:** Document assumptions clearly and validate them against the backlog's acceptance criteria before writing code.
- **Subagents:** Use subagents when ever it seems useful and reasonable for you. Use this heavily to keep the work organized and allow parallel work.

## Assumptions and Defaults

1. Default repository: The current working directory is the root of the `Conspectus-Mobile` repository.
2. Default quality gate scripts are those currently in `package.json`.
3. "Everything green" means all required local checks pass and required GitHub checks pass.
4. If e2e is costly, run only when changed area touches e2e-relevant behavior.
5. "Mark issue done" means both GitHub issue state and backlog markdown status marker are updated.

## Quality and Guidelines

1. **Clean Code & Architecture:** Enforce DRY (no duplication) and KISS (no over-engineering). Keep cyclomatic complexity low. Avoid deeply nested code (Arrow Anti-Pattern), spaghetti code, and excessively long methods. Use common libraries instead of reinventing the wheel.
2. **Overengineering & Maintainability Check:** Ensure implementation complexity is proportional to issue scope. Explicitly avoid unnecessary abstractions, duplicated negative-case tests, over-defensive checks where internal contracts are stable, and UI interaction/animation machinery that adds LOC without durable value.
3. **UI/UX:** UI components must be fully responsive across screen sizes. The UI must communicate system status clearly. Always implement loading states for async actions, explicit error/success feedback, and prevent double-submissions. Good and simple but modern and beautiful UX is very important!
4. **AI Anti-Patterns (STRICTLY FORBIDDEN):** Never implement "backup" solutions, redundant fallbacks, or placeholder code. Do not introduce technical debt.
5. **Documentation:** Code must be self-explanatory. Add meaningful inline comments only for complex or non-obvious logic. Every file should start with a short description of what the file does and why it is needed.
6. **Testing:** All new or changed behavior must be accompanied by appropriate, passing tests. Tests should verify real functionality, cover important edge cases and failure scenarios, and provide meaningful regression protection.
7. **Contextual Alignment:** Before coding, verify that prerequisites from previous tasks are complete. Ensure your implementation serves as a solid foundation for related upcoming issues in the backlog.
