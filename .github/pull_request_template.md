# Pull Request

## Linked Issue or Task

- Closes #<issue-id>, or describe the manual task when no issue exists:

## Context

- Problem:
- Goal:

## Changes

-

## Test Plan

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- Notes:

## Screenshots

- [ ] UI change: screenshots attached
- [ ] No UI change

## Manual Device QA (Release PRs Only)

- [ ] Not a release PR; physical-device QA is not required here.
- [ ] Release PR: all required rows in
      [`docs/Manual-Device-QA.md`](https://github.com/Jon2050/Conspectus-Mobile/blob/main/docs/Manual-Device-QA.md)
      pass.
- Tested candidate URL / commit:
- Completed results and evidence location in this PR:

## Release Process (Release PRs Only)

- [ ] Not a release PR; the release-cut process is not required here.
- [ ] Release PR: the single checklist from
      [`docs/Release-Process.md`](https://github.com/Jon2050/Conspectus-Mobile/blob/main/docs/Release-Process.md)
      is copied into this PR or a dedicated PR comment and completed there.
- Planned version / tag:
- Candidate commit / `Quality` / `Deploy Preview` evidence:
- Reviewer-agent approval evidence:
- Human release-owner `APPROVED FOR RELEASE` evidence:
- Approved release-notes location:
- Production commit / `Deploy Production` / post-deploy evidence:

## Risk Notes

- User impact:
- Rollback plan:

## QS Checklist

- [ ] The linked issue or manual-task context is included in this PR.
- [ ] Lint, typecheck, tests, and build were run and pass.
- [ ] Screenshots are included for UI changes.
- [ ] Risk and rollback notes are documented.
- [ ] No secrets, tokens, or credentials were added to the repository.
- [ ] No unintended path/base URL changes were introduced (production must remain rooted at `https://jon2050.de/conspectus/`).

## Merge And Cleanup (PR Path)

- [ ] Required GitHub checks are green.
- [ ] PR will be merged into `main` with `Rebase and merge`.
- [ ] PR will be merged into `main` once checks/review requirements are satisfied.
- [ ] Head branch will be deleted after merge.
- [ ] Linked issue/backlog marker will only be marked done after merge.
