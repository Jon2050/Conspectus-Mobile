# M2-07 Installability Verification

Issue: [#25](https://github.com/Jon2050/Conspectus-Mobile/issues/25)
Production URL: `https://jon2050.de/conspectus/webapp/`
Verification Date: 2026-03-03

## Acceptance Criteria Mapping

| Acceptance Criterion                                                          | Verification Method                                                                                                                                                                 | Evidence                                                                                                                                                           | Status                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Install flow works on both platforms.                                         | Automated installability prerequisite checks (manifest, scope, service worker, Android icons, iOS apple-touch-icon) plus required manual Add to Home Screen checks on real devices. | Automated: `tests/e2e/app-shell.spec.ts`, `scripts/verify-production-deploy-smoke.mjs`, `scripts/verify-production-deploy-smoke.test.ts`. Manual: checklist below. | Pass                                         |
| Documented issues are tracked as bugs.                                        | Any failed installability check must create a GitHub issue with label `bug`, screenshot evidence, and link back to M2-07.                                                           | Bug links section below (`#106`).                                                                                                                                  | Pass                                         |
| Installed app icon is the Conspectus moneybag icon set (no placeholder icon). | Manifest icon contract checks, icon URL reachability checks, apple-touch-icon contract checks, and manual home-screen icon confirmation.                                            | `vite.config.ts`, `index.html`, `tests/e2e/app-shell.spec.ts`, `scripts/verify-production-deploy-smoke.mjs` + checklist below.                                     | Pass (visual-cropping defect tracked as bug) |

## Scope Notes

- Real-device Add to Home Screen UI taps on iOS Safari and Android Chrome are not directly automatable in this repository CI environment.
- Automated checks in this repository verify installability prerequisites and icon contracts.
- Manual device checks remain required to complete M2-07 acceptance criterion 1.

## Automated Verification Scope

Automated checks for this issue validate:

- PWA manifest includes required moneybag install icons (`192x192`, `512x512`).
- Manifest icon URLs resolve successfully.
- App HTML publishes a moneybag `apple-touch-icon` link for iOS home screen installation.
- Existing app-shell/service-worker/manifest/scope/deploy metadata smoke checks stay green.

## Manual Production Verification (Required)

Perform these checks after deployment:

- iOS Safari Add to Home Screen on `https://jon2050.de/conspectus/webapp/`
- Android Chrome install/Add to Home Screen on `https://jon2050.de/conspectus/webapp/`

### iOS Safari (latest iOS)

| Check                                                                 | Result | Screenshot / Notes                                                 |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Open `https://jon2050.de/conspectus/webapp/` in Safari.               | Pass   | Manually verified by user.                                         |
| Use Safari share menu -> Add to Home Screen.                          | Pass   | Manually verified by user.                                         |
| App installs without errors.                                          | Pass   | Manually verified by user.                                         |
| Home screen icon is the Conspectus moneybag icon (not placeholder).   | Pass   | Asset is correct; visual centering/cropping issue tracked in #106. |
| Launch app from home screen opens Conspectus Mobile standalone shell. | Pass   | Manually verified by user.                                         |

### Android Chrome (latest stable)

| Check                                                                 | Result | Screenshot / Notes                                                 |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Open `https://jon2050.de/conspectus/webapp/` in Chrome.               | Pass   | Manually verified by user.                                         |
| Use Chrome install/Add to Home Screen flow.                           | Pass   | Manually verified by user.                                         |
| App installs without errors.                                          | Pass   | Manually verified by user.                                         |
| Home screen icon is the Conspectus moneybag icon (not placeholder).   | Pass   | Asset is correct; visual centering/cropping issue tracked in #106. |
| Launch app from home screen opens Conspectus Mobile standalone shell. | Pass   | Manually verified by user.                                         |

## Bug Tracking Links

Add bug links here if any installability check fails:

- [#106](https://github.com/Jon2050/Conspectus-Mobile/issues/106) - PWA homescreen icon appears cropped/off-center after install.

Bug filing rule for this issue:

1. Create issue in `Jon2050/Conspectus-Mobile` with label `bug`.
2. Attach screenshot(s) showing the failure.
3. Link back to [#25](https://github.com/Jon2050/Conspectus-Mobile/issues/25).
4. Add the new bug issue link in this section.
