# Post-Milestone Fix Prompt Template

This template guides implementation agents through resolving selected findings from a completed
post-milestone review. It applies only to the named review file and findings, inherits the
repository's contribution and verification rules, and does not authorize pushing, merging, release
decisions, or unrelated changes.

First, read the files README.md and docs\ARCHITECTURE.md to understand this project. The milestone {{milestone_number}} was just implemented and the project is currently in a review for the code changes after milestone {{milestone_number}}. Multiple reviewers already wrote a review file docs\m{{milestone_number}}\_post_review.md. Please read it also. Please then fix the findings {{findings_list}}. When doing that, stick to the code and architecture guidelines you find in the file docs\prompts\Issue-Task-Prompt-Template.md and also use the development process described there. Add new tests if appropriate. But after the findings are fixed and all local quality gates passed, mark the finding(s) in the review file as solved/fixed and commit the changes locally to the review-fixing branch. Don't push the commit yet.
