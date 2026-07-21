# Release Blockers

This is the authoritative working file for Conspectus-Mobile release readiness. The MVP must not
be announced or marked complete while any blocker below is open. Release-execution actions that
clear RB-04 may begin only after prerequisite blockers RB-01 through RB-03 are cleared. The backlog
remains the implementation index; [`docs/Release-Process.md`](docs/Release-Process.md) remains the
execution runbook.

Last verified: 2026-07-22

## Current decision

**NOT READY FOR RELEASE**

| ID    | Release-readiness item                                    | Status                  | Cleared only when                                                                                                               |
| ----- | --------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| RB-01 | Runtime security headers are absent                       | Cleared — risk accepted | #82 and #120 meet their production acceptance criteria or an explicit security/product decision formally changes those criteria |
| RB-02 | Production Microsoft sign-in                              | Cleared — verified      | The Entra SPA redirects are verified and a real production sign-in returns to `/conspectus/`                                    |
| RB-03 | Physical-device QA is incomplete                          | Open                    | Every required iOS/Android scenario passes on the exact candidate and #106 is resolved                                          |
| RB-04 | No qualified, approved, deployed release candidate exists | Open                    | The full release process, final review, exact-SHA deployment, tag, and GitHub Release are complete                              |

## RB-01 — Runtime security-header limitation accepted

### Original risk

The production app handles authentication and a personal financial database. Its HTML document
contains a CSP fallback, but the live response currently supplies only HSTS—not runtime
`Content-Security-Policy`, `X-Content-Type-Options`, or `Referrer-Policy` headers. A document CSP
cannot provide every header-only protection, and the current acceptance criteria in
[#82](https://github.com/Jon2050/Conspectus-Mobile/issues/82) and
[#120](https://github.com/Jon2050/Conspectus-Mobile/issues/120) explicitly require the real
production hosting stack to deliver and verify these headers. Describing this as complete would be
factually incorrect.

### Decision and residual risk

On 2026-07-22, the application owner explicitly accepted this limitation for the current MVP
because the free production host cannot emit the headers and changing hosting is not available.
Production retains HSTS plus the checked document-level CSP and referrer-policy meta tags. It does
not receive runtime `Content-Security-Policy`, `X-Content-Type-Options`, or `Referrer-Policy`
headers. In particular, the document CSP cannot supply header-only protections such as
`frame-ancestors`, and no response-level MIME-sniffing protection is present.

This decision clears RB-01 by formally changing the release criterion; it does not claim technical
equivalence or close the tracking issues. Reconsider the decision when hosting capabilities change,
when the application exposure changes materially, or after any relevant security incident. A future
technical fix remains: provide a capable host/edge, apply the canonical headers, restore strict live
header assertions, and verify them repeatedly against production.

### Why it is not fixed already

AllDomains Free Hosting does not provide PHP and has ignored the artifact-owned `.htaccess`
header directives in live responses. The prepared application and website contracts work, but the
free hosting layer cannot enforce the required response headers. No paid package was purchased,
and moving the domain behind another edge/proxy would be a material infrastructure and security
decision that must not be made implicitly.

## RB-02 — Production Microsoft sign-in verified

### Original risk

Microsoft redirect URI matching is exact. If the Entra SPA registration lacks
`https://jon2050.de/conspectus/`, or still depends on a retired production URI, users can reach the
app but cannot complete sign-in. Authentication and OneDrive binding are core MVP functions, so a
release without an authoritative configuration check and real sign-in smoke would be unusable for
its primary purpose.

### Required verification

1. Authenticate to Microsoft Entra with an account that can manage application
   `94c434a2-a0ad-485e-90a6-660a08dd8a48`.
2. Verify the SPA redirect list contains the documented local, production, main-preview, and
   test-preview URIs while all four channels remain in use.
3. Remove retired production redirects for the deleted subdomain and nested `/webapp/` path.
4. Use the dedicated QA Microsoft account to sign in on production and verify the callback returns
   to `/conspectus/` without a loop or configuration error.

### Clearing evidence

On 2026-07-21, the live main preview initiated an MSAL PKCE request with client ID
`94c434a2-a0ad-485e-90a6-660a08dd8a48` and the exact callback
`https://jon2050.github.io/Conspectus-Mobile/previews/main/`, then reached the Microsoft account
sign-in page. Separate public authorization probes also reached Microsoft sign-in for the production
and test-preview callbacks.

On 2026-07-22, the application owner confirmed that the required Entra registration was completed
and manually verified real production Microsoft sign-in and OneDrive application behavior. The
tested production deployment is successful run
[`29871002715`](https://github.com/Jon2050/Conspectus-Mobile/actions/runs/29871002715) for commit
`835651dc121ee7a5a637bf7db0d97bafb643bd01`, with live build time
`2026-07-21T21:42:34Z`. This clears RB-02.

## RB-03 — Physical-device QA incomplete

### Why this seriously blocks release

iOS Safari, installed iOS PWAs, Android Chrome, and installed Android PWAs differ in installation,
service-worker lifecycle, storage, authentication, viewport handling, and network recovery.
Automated desktop-browser tests cannot establish those platform behaviors. When this blocker was
opened, [#106](https://github.com/Jon2050/Conspectus-Mobile/issues/106) reported a
cropped/off-center home-screen icon that directly conflicted with the required `QA-01` result. The
corrected icon is now deployed, but its required installed-device evidence is not recorded. The
remaining scenarios exercise real OneDrive reads and writes, upload interruption, offline
protection, and expired session recovery; failure could lose trust or create duplicate financial
writes.

### How to fix it

1. Retain the completed icon padding/maskable metadata and automated manifest/Apple touch-icon
   verification.
2. Create the exact release candidate and freeze its shared preview slot.
3. Run every scenario in [`docs/Manual-Device-QA.md`](docs/Manual-Device-QA.md) on a physical iPhone
   and a supported physical Android phone using the disposable QA account/database.
4. Attach the required screenshots, device/browser versions, candidate identity, failures, and
   successful reruns to the release pull request.
5. Resolve #106 and record `PASS` for every required matrix cell.

The repository repair now uses padded install artwork, dedicated `192x192` and `512x512` maskable
assets, and build/live contract checks for both `any` and `maskable` manifest purposes. This is only
the automated prerequisite for QA-01; physical installed-icon verification is still required.

### Why it remains open

The reviewed icon correction is deployed, and the application owner confirmed that a phone updated
to the current production build. The complete QA-01 through QA-08 matrix, exact iOS/Android device
and browser versions, disposable OneDrive fixture evidence, and required screenshots are not yet
recorded. Browser emulation or a general manual smoke does not satisfy the committed release gate.

## RB-04 — No qualified, approved, deployed release candidate exists

### Why this seriously blocks release

The current repository `main` and its required checks are green, and production deployment run
`29871002715` successfully published exact main commit
`835651dc121ee7a5a637bf7db0d97bafb643bd01`. However, there is no completed release-candidate
version/PR, final M8 review, full physical QA evidence, recorded human `APPROVED FOR RELEASE`
decision, immutable version tag, or GitHub Release. A successful production workflow alone does not
complete the repository's release process.

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

RB-01 is cleared by explicit risk acceptance and RB-02 by real production verification. RB-03 and
the remaining release-process evidence above are still open. The release process correctly forbids
creating a successful tag or release merely because repository CI and one production deployment are
green.
