# Manual Device QA

This document defines the required physical-device smoke gate and the evidence that a release pull
request must retain for Conspectus-Mobile. It does not define how a release branch, tag, deployment,
or rollback is performed.

## Release Gate

Run this checklist against the exact deployed HTTPS release candidate referenced by the release
pull request. Every required scenario must pass on both required physical devices before release.
Emulators and additional browsers are useful supplemental coverage, but they do not satisfy either
required matrix row.

Use these result values consistently:

- `PASS`: every step and expected result was observed on the recorded candidate.
- `FAIL`: at least one expected result was not observed.
- `BLOCKED`: the scenario could not be completed because a prerequisite or external dependency was
  unavailable.
- `NOT RUN`: the scenario was not attempted on that device.

Only `PASS` satisfies the gate. A `FAIL`, `BLOCKED`, or `NOT RUN` result blocks release. Link every
failure to a bug, retain supporting evidence, fix the defect, and rerun the affected scenario on the
affected device. Record both the original result and the rerun in the release pull request.

## Candidate Record

Record these values before testing:

| Field                | Required value                                     |
| -------------------- | -------------------------------------------------- |
| Release pull request | PR URL or number                                   |
| Candidate URL        | Exact deployed HTTPS URL                           |
| Candidate commit     | Full Git commit SHA                                |
| App identity         | Version and UTC build time shown in the app footer |
| Deployment identity  | Workflow run or deployment URL, when available     |
| Test window          | Start and end timestamps with time zone            |
| Tester               | Name or GitHub handle                              |

If the footer identity does not match the intended candidate, stop and mark all scenarios `BLOCKED`
until the correct artifact is deployed.

## Required Device Matrix

Use the latest generally available iOS patch and latest stable Safari available on the execution
date. Use a currently supported Android release and the latest stable Chrome available on the
execution date. Record exact versions so the result remains reproducible after browsers and
operating systems update.

| Platform ID | Required physical device                                 | Modes that must be tested           | Record before execution                                    |
| ----------- | -------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `IOS`       | iPhone with current generally available iOS              | Safari and installed standalone PWA | Make/model, iOS version, Safari version, update status     |
| `ANDROID`   | Android phone with a currently supported Android release | Chrome and installed standalone PWA | Make/model, Android version, Chrome version, update status |

Recommended supplemental coverage: iPad Safari and a recent Samsung Internet release. Record this
separately; supplemental results do not replace `IOS` or `ANDROID`.

## Preconditions and Safety

- Use a dedicated QA Microsoft personal account and a disposable copy of a representative
  Conspectus `.db` file in that account's OneDrive. Never use a personal financial database.
- Close Conspectus Desktop and do not open it during the test window.
- Record the fixture's known starting accounts, balances, current-month transfers, and eTag or
  OneDrive version. Restore the fixture to that baseline before changing platforms.
- Confirm the candidate URL is an exact redirect URI registered for the test app. Preview sign-in
  requires the optional preview redirect described in
  [`docs/auth/Entra-App-Registration.md`](auth/Entra-App-Registration.md).
- Start with both devices online and capable of switching network connectivity independently.
- Prepare a recoverable expired-session state for scenario `QA-07` while leaving the app's local
  binding intact. Record how the Microsoft session was invalidated; do not change this procedure
  between platforms.
- Capture screenshots or a short screen recording for failures and for the key success states named
  below. Do not expose tokens, credentials, or real financial data.

## Required Scenarios

Run `QA-01` through `QA-08` in order on each required platform. Restore the fixture baseline and
clear the app's site data before starting the second platform.

### QA-01 Install and standalone relaunch

1. Open the candidate URL in the platform browser.
2. Add the app to the home screen using the platform's standard install flow.
3. Launch the installed app from its home-screen icon, close it, and launch it again.

Expected results:

- The install name is Conspectus and the moneybag icon is used without clipping or a placeholder.
- The installed app opens the candidate route in standalone mode without browser chrome, a blank
  screen, or an out-of-scope redirect.
- The second launch completes and shows the same app version/build identity as the tested candidate.

Evidence: home-screen icon plus the standalone app footer.

### QA-02 Sign in, bind, and initial read

1. In the standalone app, sign in with the QA Microsoft personal account.
2. Select the prepared `.db` file in the OneDrive browser.
3. Wait for the initial sync to finish, then open Accounts and Transfers.

Expected results:

- Sign-in returns to the app without a redirect loop and shows the expected QA account.
- The file browser allows the prepared database to be selected once and reports clear loading and
  completion states without duplicate actions.
- Accounts shows the known visible non-primary accounts and balances.
- Transfers defaults to the device's current month and shows the known current-month transfers.
- No stale financial data appears before the online freshness check succeeds.

Evidence: signed-in Settings identity, bound-file identity, Accounts, and Transfers.

### QA-03 Month navigation and mobile layout

1. On Transfers, use the visible previous and next buttons and confirm the original month is
   restored.
2. Swipe to the previous and next month and confirm the original month is restored again.
3. Open Add Transfer, focus every input, scroll the sheet, and close it without saving.
4. Rotate once between portrait and landscape, then return to portrait.

Expected results:

- Buttons and swipes each move exactly one month in the expected direction.
- Month labels and transfer rows update without unintended horizontal page scrolling.
- Primary controls remain reachable, are not clipped by a notch/home indicator/keyboard, and do not
  overlap the deployment footer or bottom navigation.
- Focusing inputs does not trigger iOS page zoom, and rotation does not lose the selected month.

Evidence: one screenshot of Transfers and one of the keyboard-open Add Transfer sheet.

### QA-04 Successful transfer write and persistence

1. Record the source and destination balances and current transfer count.
2. Create one valid, uniquely named transfer between the prepared accounts.
3. Tap Save once and wait until upload completes.
4. Refresh or fully close and relaunch the app, then return to Accounts and Transfers.

Expected results:

- Save cannot be submitted twice while pending, and visible upload progress precedes success.
- Success is shown only after the OneDrive upload completes.
- Exactly one transfer appears with the entered date, name, amount, accounts, and categories.
- The source and destination balances change by exactly the transfer amount in opposite directions.
- The transfer and updated balances remain after a fresh online sync on relaunch.

Evidence: pending/progress state when practical, saved transfer, and updated balances.

### QA-05 Network loss during upload and retry

1. Restore the fixture baseline, run Force refresh to load its current OneDrive version, and open a
   new valid transfer with a unique name.
2. Tap Save and disable network connectivity as soon as upload progress becomes visible. If the
   upload finishes before connectivity is disabled, restore the fixture and repeat until the
   interruption occurs during the upload.
3. Observe the failed state, then close and reopen the Add Transfer sheet.
4. Restore connectivity and use the offered retry action once.
5. Relaunch online and inspect the transfer and balances.

Expected results:

- Interrupted upload never reports success and presents an actionable, retryable error.
- The entered draft remains available without retyping after the sheet is reopened.
- Retry progress is visible and the retry action cannot be submitted twice while pending.
- After retry, exactly one transfer and one pair of balance updates exist; the local write is not
  applied a second time.

Evidence: failed state with retained draft plus the successful single-write result.

### QA-06 Offline startup and write protection

1. After a successful online sync, fully close the installed app.
2. Disable network connectivity and relaunch it.
3. Visit Accounts, Transfers, Add Transfer, and Settings.
4. Restore connectivity and trigger the available recovery or force-refresh action.

Expected results:

- Startup fails closed with a persistent, actionable offline/sync error.
- Cached Accounts and Transfers financial rows are not rendered while freshness is unverified.
- Transfer saving is unavailable and the UI clearly explains the online requirement.
- Settings remains reachable for recovery.
- Reconnection and refresh restore current data without requiring site-data deletion.

Evidence: offline error, unavailable financial data/write action, and recovered online state.

### QA-07 Expired-session recovery and route preservation

1. While online, navigate to Transfers and select a non-current month.
2. Fully close the app and invalidate the prepared QA Microsoft session using the recorded method,
   without clearing the app's site data or file binding.
3. Relaunch the standalone app and follow the re-authentication action once.
4. Complete Microsoft sign-in and wait for sync.

Expected results:

- The app reports that sign-in is required without exposing cached financial data as current.
- A single user action starts one re-authentication flow; repeated redirects or stacked prompts do
  not occur.
- Successful sign-in returns to Transfers with the previously selected month still selected.
- A fresh sync completes and current transfer data becomes available.

Evidence: sign-in-required state and restored Transfers route/month after re-authentication.

### QA-08 Settings force refresh, reset, and rebind

1. In Settings, record the bound file and last-sync time, then run Force refresh once.
2. Confirm local reset, relaunch if prompted, and inspect Accounts, Transfers, and Settings before
   signing in again.
3. Sign in, bind the prepared fixture database again, and wait for the first sync.

Expected results:

- Force refresh has visible progress, prevents duplicate submission, preserves the binding, and
  advances the last-sync time only after success.
- Confirmed reset removes the QA account session, binding, and cached snapshot; old financial data
  is not displayed afterward.
- The app remains usable for sign-in and rebind, and the rebound database performs a fresh online
  sync with the expected accounts and transfers.

Evidence: force-refresh completion, post-reset unbound state, and rebound file/current data.

## Release Pull Request Evidence

Copy the following block into the release pull request body or a dedicated release pull request
comment. Attach evidence to that pull request or link durable evidence from it. Local notes or an
unlinked issue do not satisfy the gate.

```markdown
## Manual Device QA

### Candidate

- Candidate URL:
- Commit SHA:
- App version / UTC build time:
- Deployment or workflow run:
- Test window and time zone:
- Tester:

### Devices

| Platform | Make/model | OS version | Browser version | Installed mode tested | Update status |
| -------- | ---------- | ---------- | --------------- | --------------------- | ------------- |
| IOS      |            |            |                 | Yes / No              |               |
| ANDROID  |            |            |                 | Yes / No              |               |

### Results

| Scenario                                              | IOS     | ANDROID | Evidence / defect links |
| ----------------------------------------------------- | ------- | ------- | ----------------------- |
| QA-01 Install and standalone relaunch                 | NOT RUN | NOT RUN |                         |
| QA-02 Sign in, bind, and initial read                 | NOT RUN | NOT RUN |                         |
| QA-03 Month navigation and mobile layout              | NOT RUN | NOT RUN |                         |
| QA-04 Successful transfer write and persistence       | NOT RUN | NOT RUN |                         |
| QA-05 Network loss during upload and retry            | NOT RUN | NOT RUN |                         |
| QA-06 Offline startup and write protection            | NOT RUN | NOT RUN |                         |
| QA-07 Expired-session recovery and route preservation | NOT RUN | NOT RUN |                         |
| QA-08 Settings force refresh, reset, and rebind       | NOT RUN | NOT RUN |                         |

### Reruns

| Date/time | Platform | Scenario | Candidate commit | Previous result | New result | Evidence / defect |
| --------- | -------- | -------- | ---------------- | --------------- | ---------- | ----------------- |
|           |          |          |                  |                 |            |                   |

### Final Gate

- [ ] Every QA-01 through QA-08 result is PASS on IOS and ANDROID.
- [ ] Every failure is linked to a defect and its affected scenario has a passing rerun.
- [ ] Evidence is attached to or durably linked from this release pull request.
- Final status: BLOCKED / PASS
```
