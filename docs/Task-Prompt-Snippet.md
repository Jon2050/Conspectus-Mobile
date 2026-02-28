# Task Prompt Snippet

Task: Implement issue `M<milestone>-<issue-number>` in this repository end-to-end with verification.

Execution rules:
- Work only in this repository.
- Do not modify unrelated files.
- If requirements are ambiguous, infer from architecture/backlog docs and state assumptions.
- Keep changes minimal but complete for acceptance criteria.

Workflow:
1) Context loading
- Read only these docs first:
  - `README.md`
  - `docs/Architecture-and-Implementation-Plan.md`
  - `docs/Conspectus-Desktop-Info.md`
  - `docs/GitHub-Issues-MVP-Backlog.md`
- Locate issue `M<milestone>-<issue-number>` and extract:
  - implementation steps
  - acceptance criteria
  - dependencies/constraints

2) Plan
- Spawn one planning subagent to create an implementation plan.
- Review the plan and refine until it is concrete, testable, and maps each acceptance criterion to code/test changes.
- Plan must include file-level change list.

3) Implement
- Execute the approved plan.
- Keep commits scoped to the issue only.
- If tests are applicable, add/update tests covering new behavior.

4) Local verification (must all pass)
- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- If e2e is relevant to changed behavior, also run: `npm run test:e2e`

5) Code review gate
- Spawn one reviewer subagent to review diff against `M<milestone>-<issue-number>` acceptance criteria and code review best practices.
- If gaps are found, fix them and re-run step 4.
- Repeat until reviewer reports criteria satisfied.

6) Git strategy + GitHub
- Determine integration path:
  - Preferred: issue branch + PR.
  - Allowed fallback: direct commit to `main` only when repository policy allows it.
- Create a clear commit message referencing the issue and acceptance criteria mapping.
- Commit and push.
- If using PR path, ensure PR links the issue (for example, `Closes #<issue-id>`).

7) CI gate
- Wait for required GitHub checks to finish green.
- If checks fail, fix and repeat from local verification.

8) Completion updates
- If using PR path:
  - Merge PR into `main`.
  - Delete the head branch after merge.
- If using direct-main path:
  - Verify the implementation commit is on `main`.
  - Ensure no temporary issue branch remains.
- Mark the issue as done in GitHub.
- Update `docs/GitHub-Issues-MVP-Backlog.md` status marker to done.
- Provide final report with:
  - changed files
  - commands run and results
  - CI status
  - acceptance criteria checklist
  - assumptions made

### Test Cases and Scenarios

1. Happy path: issue implemented, all local checks green, CI green, merged into `main` (or direct-main commit verified), issue marked done.
2. Partial implementation detected by reviewer subagent: fixes applied, checks rerun, then pass.
3. Failing local check: stop progression, fix, and re-run full verification gate.
4. Failing CI after push: fetch logs, patch, re-run local checks, push again, and re-verify CI.
5. Ambiguous requirement: document assumptions and validate against backlog acceptance criteria.

### Assumptions and Defaults

1. Default repository: `C:\Users\Jonas\Repositories\Conspectus-Mobile`.
2. Default quality gate scripts are those currently in `package.json`.
3. "Everything green" means all required local checks pass and required GitHub checks pass.
4. If e2e is costly, run only when changed area touches e2e-relevant behavior.
5. "Mark issue done" means both GitHub issue state and backlog markdown status marker are updated.
