# Build identity and PWA update reliability

Date: 2026-10-21. Branch: `codex/build-metadata-identity`.
Reviewed source base: `8c81c40a40e57856192979b3f69e651cd62b052d` plus the task's working-tree changes,
including the new activation helper and its tests. No unrelated existing changes were present.

## Diagnosis and delivered behavior

- The public test preview already contained the latest AP5 source, but installed clients could
  retain an older app shell. A hard refresh could leave the page without a controlling worker.
  The previous update callback only sent `SKIP_WAITING`; its fulfilled promise did not prove that
  navigation occurred. Workbox's conditional controlling-event reload could then leave the UI at
  “Updating…” indefinitely. Immediate activation without a waiting event could also leave an old
  in-memory bundle without an update notification.
- Build version `0.9.05` was genuinely present in the source. M9-01 had changed published `1.0.0`
  back to `0.9.01`. The development package and both lockfile root versions now use `1.0.1-dev`.
  This is not a production release. Builds compare the version with stable release tags; CI build
  checkouts fetch history/tags so future version downgrades fail.
- Vite creates one identity containing package version plus commit suffix, full commit SHA, and
  actual UTC build time. It embeds that object in the app and emits the same `build-info.json`.
  Footer and Settings read it synchronously. They no longer overwrite a running bundle's timestamp
  with independently fetched deployment metadata. The existing timestamp remains separate from
  the version. Rebuilding the same commit captures a new build time.
- Discovery runs at registration, foreground return, online return, and hourly; overlapping checks
  are coalesced. Waiting workers and newly activated workers on uncontrolled pages both produce
  the persistent update prompt. Discovery itself requests neither activation nor navigation.
- Confirmation observes the waiting worker's activation directly and reloads the page, including
  the uncontrolled-page case. An already activated worker is handled by reloading. A 15-second
  watchdog aborts the application-side wait and restores a visible retry action if activation or
  navigation stalls. It does not cancel an activation already requested inside the browser.
- Artifact verification checks the expected commit and exact metadata strings in the JavaScript
  bundle. Production handoff reads the generated build time instead of creating a deployment-time
  replacement. Existing rollback artifacts retain their original identity.

## Verification

- `npm run check:local`: passed, including formatting, lint, strict typecheck, dead-code checks,
  729 app tests passed / 2 skipped, 143 script tests passed, production build, and bundle budgets.
- Preview build plus `verify-build-channel.mjs --channel preview --commit <HEAD>`: passed;
  production channel verification and both channel bundle-size checks also passed.
- Complete Playwright suite against the preview artifact, with one worker and the preview base
  path: 309 passed, 9 intentional skips across Chromium, Pixel 5, and iPhone WebKit.
- The new hard-refresh cases first reproduced the old behavior, then verified actual new version
  and build-time values after updating, with and without another controlled tab. A deliberately
  stalled real worker verified the timeout, enabled retry button, and successful second attempt.
- Final E2E source lint/format checks and `git diff --check`: passed.

Physical devices, real Microsoft sign-in, and real OneDrive writes were not tested. Hosted CI and
publication are checked separately for the pushed commit; this report does not claim a production
deployment or release approval.

## Review assessment

The local source review found no blocking task-related defects. The most complex flow is split
between browser registration/discovery, the native activation helper, and the Svelte UI controller.
That division keeps worker-state transitions separate from UI retry/deadline state.

An additional static review used the [agy-review skill](../../.agents/skills/agy-review/SKILL.md),
model `gemini-3.8-flash-high`, effort `high`, in one completed round. Conversation:
`3bb26246-af95-4136-b681-65213bf713d1`. It reported no actionable findings and assessed the separation
as cohesive and maintainable. There were no findings to accept, partially accept, or reject.

The independent snapshot excluded credentials, private/runtime data, dependencies, and generated
output. Its tracked diff SHA-256 was
`3E18DAD15D6A33BFCBE8AF72BDE3342CB57F6BA923840CAE67C0ED1860E6D2FD`.
Status, HEAD, tracked diff, and both new source files were unchanged after review. The reviewer ran
no application/test commands; runtime conclusions rely on the local verification above. This
delivery report was added after the code review and does not change application behavior.

APPROVED
