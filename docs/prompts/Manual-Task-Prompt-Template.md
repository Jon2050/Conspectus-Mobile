Manual task for repository `C:\Users\Jonas\Repositories\Conspectus-Mobile`.

First, read these files in full:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/prompts/Task-Prompt-Template.md`

Follow all rules, quality requirements, verification gates, subagent rules, and review-gate requirements defined in `Task-Prompt-Template.md` but ignore the Issue mentioned there.

Important: The task below does not refer to an existing GitHub issue or a planned backlog issue. It is a manual task. Therefore:

- Do not post GitHub issue comments.
- Do not close, label, or otherwise modify any issue.
- Do not change backlog status unless explicitly requested.
- Name the branch, commit, and PR appropriately for the task.
- Only bump the app version when the task or repository conventions clearly require it.

Work end to end:

1. Load the relevant context and state any assumptions.
2. For non-trivial tasks, use a planning subagent before implementation.
3. Implement the change minimally and cleanly.
4. Add or update appropriate tests.
5. Run the local gates: `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e` when the change is UI- or E2E-relevant.
6. Run a reviewer subagent using `docs/prompts/Code-Review-Prompt-Template.md` in `local` mode.
7. Only push, open a PR, or merge when all local gates pass and the reviewer returns `APPROVED`.
8. After pushing or merging, verify CI and do not consider the task complete until all checks are green.

Task:
[Insert task here]
