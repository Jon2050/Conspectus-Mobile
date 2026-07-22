# Conspectus-Mobile GitHub Issues Backlog

This document is the lightweight active issue index for Conspectus-Mobile maintainers and
contributors. It makes planned work, status, dependencies, and GitHub links visible in one place so
that work can be selected and tracked consistently. Detailed requirements, acceptance criteria,
discussion, and implementation evidence belong in the linked GitHub issue and pull request; this
file does not replace them or the delivery workflow in [`CONTRIBUTING.md`](CONTRIBUTING.md).

The completed MVP backlog is preserved for historical reference in
[`archive/releases/mvp/GitHub-Issues-MVP-Backlog.md`](archive/releases/mvp/GitHub-Issues-MVP-Backlog.md).
Do not copy completed MVP entries into this active backlog.

## Issue status legend

- `:green_circle:` Open
- `:yellow_circle:` In progress
- `:white_check_mark:` Done

Update the marker in an issue heading when its status changes. The linked GitHub issue remains the
authoritative source for its live state and details.

## Completion rule

An issue is considered done in this backlog only when:

1. Its implementation has reached `main` through the contribution workflow in
   [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. The required checks for the merged commit are green.
3. The GitHub issue is closed and its merged head branch has been deleted.
4. The corresponding backlog heading uses `:white_check_mark:` and links to the closed GitHub
   issue.

## Add an issue

1. Create the GitHub issue with the appropriate template from
   [`.github/ISSUE_TEMPLATE`](../.github/ISSUE_TEMPLATE/).
2. Copy the entry template below into [Backlog](#backlog).
3. Replace every placeholder, use exactly one primary label, and link the GitHub issue.
4. Use the GitHub issue number as the task ID when no separate project or milestone ID exists.

```markdown
### :green_circle: {{TASK_ID}} {{ISSUE_TITLE}}

- Label: `{{PRIMARY_LABEL}}`
- Milestone: `{{MILESTONE_OR_NONE}}`
- Summary: {{ONE_OR_TWO_SENTENCE_SUMMARY}}
- Depends on: `{{TASK_IDS_OR_NONE}}`
- GitHub: [#{{ISSUE_NUMBER}}](https://github.com/Jon2050/Conspectus-Mobile/issues/{{ISSUE_NUMBER}})
```

## Backlog

Add new issue entries here using the template above. Keep entries ordered by milestone or, when no
milestone exists, by task ID.
