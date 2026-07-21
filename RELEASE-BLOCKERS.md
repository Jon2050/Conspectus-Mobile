# Release Blockers

This is the authoritative working file for Conspectus-Mobile release readiness. The MVP must not
be announced or marked complete while any blocker below is open. Release-execution actions that
clear RB-04 may begin only after prerequisite blockers RB-01 through RB-03 are cleared. The backlog
remains the implementation index; [`docs/Release-Process.md`](docs/Release-Process.md) remains the
execution runbook.

Last verified: 2026-07-21

## Current decision

**NOT READY FOR RELEASE**

| ID    | Serious release blocker                                   | Status | Cleared only when                                                                                                               |
| ----- | --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| RB-01 | Runtime security headers are absent                       | Open   | #82 and #120 meet their production acceptance criteria or an explicit security/product decision formally changes those criteria |
| RB-02 | Production Microsoft sign-in is not verified              | Open   | The Entra SPA redirects are verified and a real production sign-in returns to `/conspectus/`                                    |
| RB-03 | Physical-device QA and install icon are unresolved        | Open   | Every required iOS/Android scenario passes on the exact candidate and #106 is resolved                                          |
| RB-04 | No qualified, approved, deployed release candidate exists | Open   | The full release process, final review, exact-SHA deployment, tag, and GitHub Release are complete                              |

## RB-01 — Runtime security headers are absent

### Why this seriously blocks release

The production app handles authentication and a personal financial database. Its HTML document
contains a CSP fallback, but the live response currently supplies only HSTS—not runtime
`Content-Security-Policy`, `X-Content-Type-Options`, or `Referrer-Policy` headers. A document CSP
cannot provide every header-only protection, and the current acceptance criteria in
[#82](https://github.com/Jon2050/Conspectus-Mobile/issues/82) and
[#120](https://github.com/Jon2050/Conspectus-Mobile/issues/120) explicitly require the real
production hosting stack to deliver and verify these headers. Describing this as complete would be
factually incorrect.

### How to fix it

1. Provide a production edge or hosting capability that can set deterministic response headers.
2. Apply the canonical CSP plus `X-Content-Type-Options: nosniff` and the agreed referrer policy to
   every app-route response.
3. Re-enable strict live header assertions in the cross-repository smoke contract.
4. Run a complete production deployment and verify the headers directly against
   `https://jon2050.de/conspectus/` on repeated requests.
5. Close #82 and #120 only after their production evidence is linked.

An explicit product/security decision may instead change the acceptance criteria and retain the
document CSP as a known limitation. That is risk acceptance, not a technical fix, and must be
documented before it can clear this blocker.

### Why it is not fixed already

AllDomains Free Hosting does not provide PHP and has ignored the artifact-owned `.htaccess`
header directives in live responses. The prepared application and website contracts work, but the
free hosting layer cannot enforce the required response headers. No paid package was purchased,
and moving the domain behind another edge/proxy would be a material infrastructure and security
decision that must not be made implicitly.

## RB-02 — Production Microsoft sign-in is not verified

### Why this seriously blocks release

Microsoft redirect URI matching is exact. If the Entra SPA registration lacks
`https://jon2050.de/conspectus/`, or still depends on a retired production URI, users can reach the
app but cannot complete sign-in. Authentication and OneDrive binding are core MVP functions, so a
release without an authoritative configuration check and real sign-in smoke would be unusable for
its primary purpose.

### How to fix it

1. Authenticate to Microsoft Entra with an account that can manage application
   `94c434a2-a0ad-485e-90a6-660a08dd8a48`.
2. Verify the SPA redirect list contains the documented local, production, main-preview, and
   test-preview URIs while all four channels remain in use.
3. Remove retired production redirects for the deleted subdomain and nested `/webapp/` path.
4. Use the dedicated QA Microsoft account to sign in on production and verify the callback returns
   to `/conspectus/` without a loop or configuration error.

### Current evidence

On 2026-07-21, the live main preview initiated an MSAL PKCE request with client ID
`94c434a2-a0ad-485e-90a6-660a08dd8a48` and the exact callback
`https://jon2050.github.io/Conspectus-Mobile/previews/main/`, then reached the Microsoft account
sign-in page. Separate public authorization probes also reached Microsoft sign-in for the production
and test-preview callbacks. The reported redirect error is therefore not reproducible from the
current canonical deployed URLs without the original device/start-URL context. Real production
account sign-in and OneDrive access remain unverified, so RB-02 stays open.

### Why it is not fixed already

The existing Azure CLI refresh token remains expired. Several device-login attempts expired or
remained unapproved at the password/passkey/MFA step, so the registration still cannot be inspected
authoritatively. The exact URL and deployment identity that produced the user's redirect error were
not captured. Account secrets and MFA require the human account owner; they cannot be bypassed or
entered by automation.

## RB-03 — Physical-device QA and install icon are unresolved

### Why this seriously blocks release

iOS Safari, installed iOS PWAs, Android Chrome, and installed Android PWAs differ in installation,
service-worker lifecycle, storage, authentication, viewport handling, and network recovery.
Automated desktop-browser tests cannot establish those platform behaviors. In addition,
[#106](https://github.com/Jon2050/Conspectus-Mobile/issues/106) reports a cropped/off-center
home-screen icon, directly conflicting with the required `QA-01` result. The remaining scenarios
exercise real OneDrive reads and writes, upload interruption, offline protection, and expired
session recovery; failure could lose trust or create duplicate financial writes.

### How to fix it

1. Correct the install icon padding/centering and supply appropriate maskable icon metadata, then
   verify the built manifest and Apple touch icon.
2. Create the exact release candidate and freeze its shared preview slot.
3. Run every scenario in [`docs/Manual-Device-QA.md`](docs/Manual-Device-QA.md) on a physical iPhone
   and a supported physical Android phone using the disposable QA account/database.
4. Attach the required screenshots, device/browser versions, candidate identity, failures, and
   successful reruns to the release pull request.
5. Resolve #106 and record `PASS` for every required matrix cell.

The repository repair now uses padded install artwork, dedicated `192x192` and `512x512` maskable
assets, and build/live contract checks for both `any` and `maskable` manifest purposes. This is only
the automated prerequisite for QA-01; physical installed-icon verification is still required.

### Why it is not fixed already

The known icon defect has not received a reviewed asset change, and the required evidence needs
physical devices, interactive Microsoft authentication, and a disposable OneDrive fixture.
Browser emulation would not satisfy the committed release gate.

## RB-04 — No qualified, approved, deployed release candidate exists

### Why this seriously blocks release

The current repository `main` and its required checks are green, but production still identifies
an older commit. There is no release-candidate PR, completed final M8 review, physical QA evidence,
human `APPROVED FOR RELEASE` decision, exact-SHA production deployment, immutable version tag, or
GitHub Release. Publishing now would detach the announced version from the code and evidence that
were actually deployed.

### How to fix it

After RB-01 through RB-03 are cleared:

1. Complete [#114](https://github.com/Jon2050/Conspectus-Mobile/issues/114), create
   `docs/m8_post_review.md`, and resolve every release-relevant finding.
2. Follow [`docs/Release-Process.md`](docs/Release-Process.md) from an exact green `main` commit:
   create the release branch, set the unused version, prepare notes, and run the full local,
   reviewer, CI, preview, Lighthouse, and physical-device gates.
3. Obtain the recorded human release approval, rebase-merge the release PR, and deploy that exact
   resulting `main` SHA manually.
4. Verify production metadata, authentication, disposable-database reads/writes, Lighthouse,
   monitoring, and rollback evidence.
5. Only then create the annotated tag and GitHub Release and close
   [#92](https://github.com/Jon2050/Conspectus-Mobile/issues/92).

### Why it is not fixed already

The upstream security, authentication, icon, and device gates are still open. The release process
correctly forbids creating a successful tag or release merely because repository CI is green.
