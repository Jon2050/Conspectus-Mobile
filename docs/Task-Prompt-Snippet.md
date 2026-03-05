# Task Prompt Snippet

Task: Implement issue `M<milestone>-<issue-number>` end-to-end with full verification.

Non-negotiable rules:

- Work only in this repository; do not modify unrelated files.
- If requirements are ambiguous, infer from architecture/backlog docs and state assumptions explicitly.
- Use web research when needed (framework/tool questions or blockers).
- Ask questions to the user only for unresolved blockers or if something important is really unclear. Also if there are steps that definitely cannot be done by you.
- Keep changes minimal but fully sufficient for all acceptance criteria.
- DO NOT close an issue in GitHub or mark it as done if not everything is done. Even if there are only tasks left for the user.

Execution workflow:

1. Load context from:
   - `README.md`
   - `docs/Architecture-and-Implementation-Plan.md`
   - `docs/Conspectus-Desktop-Info.md`
   - `docs/GitHub-Issues-MVP-Backlog.md`
     Then locate `M<milestone>-<issue-number>` and extract implementation steps, acceptance criteria, and dependencies/constraints.
2. Plan with one planning subagent. Refine until concrete, testable, and mapped from each acceptance criterion to file-level code/test changes.
3. Implement the approved plan. Keep commits scoped to this issue. Add/update tests for behavior changes.
4. Run local verification gate:
   - `npm run format`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `npm run test:e2e` when changed behavior is e2e-relevant.
5. Run review gate with one reviewer subagent against acceptance criteria and code review best practices. The reviewer must be told to explicitly look out for the testing, documentation, duplication, keep it simple (no over-engineering, no "backup" solutions, no fallbacks, no technical debts) guidelines. Also about general code quality and best practices. If gaps are found, fix and repeat steps 4-5 until satisfied.
6. Git + GitHub flow:
   - Create/use a dedicated issue branch (one branch per issue).
   - Open a PR to `main` from the issue branch (direct-main is not allowed for issue delivery).
   - Use a clear commit message referencing the issue and acceptance criteria mapping.
   - Commit and push.
   - If using PR flow, link the issue (for example: `Closes #<issue-id>`).
7. CI gate: wait for required GitHub checks to pass. If any check fails, fix and repeat from step 4.
8. Completion:
   - Merge the PR to `main`, then delete the head branch.
   - Mark issue done in GitHub.
   - Update `docs/GitHub-Issues-MVP-Backlog.md` status marker to done.
   - Update `docs/Architecture-and-Implementation-Plan.md` with implementation changes/clarifications (source of truth).
   - Provide final report with changed files, commands/results, CI status, acceptance criteria checklist, and assumptions.

### Test Cases and Scenarios

1. Happy path: implementation complete, local checks green, CI green, merged to `main`, issue marked done.
2. Reviewer finds gaps: fix, rerun local verification, re-review.
3. Local check fails: stop progression, fix, rerun full verification gate.
4. CI fails after push: inspect logs, patch, rerun local verification, push, recheck CI.
5. Requirement ambiguity: document assumptions and validate against backlog acceptance criteria.

### Assumptions and Defaults

1. Default repository: `C:\Users\Jonas\Repositories\Conspectus-Mobile`.
2. Default quality gate scripts are those currently in `package.json`.
3. "Everything green" means all required local checks pass and required GitHub checks pass.
4. If e2e is costly, run only when changed area touches e2e-relevant behavior.
5. "Mark issue done" means both GitHub issue state and backlog markdown status marker are updated.

### Quality and Guidelines

1. **Documentation**: Code must be properly documented. Code should speak for itself, but when it cannot, it should be documented. This includes inline comments, function documentation, and any other relevant documentation.
2. **Testing**: Code and functionality must be accompanied by appropriate tests.
3. **Duplication**: Do not duplicate code. If you find yourself writing the same code in multiple places, refactor it into a reusable function or component. Do also not implement multiple ways or "backup" ways of doing things. Pick the one way that is intended and implement it well.
4. **Keep it simple**: Do not over-engineer solutions. Also do not implement "backup" solutions or "fallbacks"! NEVER! Also do not add technical debts.
5. **Overview considerations**: Before implementing a feature, assure that the preparation and foundation for it that should be done by previous tasks is completed and matches the plan for the current issue. Also have a look to following Issues, that are related to the current one, to assure that the implementation is a good and matching foundation for them.
