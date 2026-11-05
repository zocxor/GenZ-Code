> For the current 0.3.0 expansion, read SECURITY_0.3_ADDENDUM.md. This file records the earlier 0.2.0 baseline.

# GenZ Code 0.2.0 — security and API safety review

Review date: 1 November 2026. Scope: source inspection, local domain tests, dependency audit, release build and APK manifest/signature inspection. This is not a penetration test, MASVS certification or a guarantee of security.

## Current release boundary

This release is a guest/local-profile Android application. Dictionary, literal decoding and games run on-device. Google/email choices are visibly unconnected; no password/email form collects credentials, no identity provider is called and no authenticated session is fabricated. There is no deployed AI gateway, CMS or user API to test. The Android INTERNET permission is explicitly removed through manifest merging, and cleartext traffic is disabled. Cloud authentication requires a real project, verified redirects and separate implementation/testing before enabling network access.

## Findings and decisions

| Area / risk | Action or observed state | Residual risk |
|---|---|---|
| Private message leakage | No message in AsyncStorage, logs, analytics, network requests or shared caches. Clear input/result when app backgrounds. Explicit clear button. | OS keyboards, screenshots, clipboard history, rooted devices and memory capture remain outside this protection. No forensic secure-erasure guarantee. |
| API-key extraction | No private API keys, AI credentials or backend secrets in application source. No connected API clients. INTERNET removed from APK. | Adding an API later creates new risk; obfuscation cannot protect a bundled secret. |
| Broken auth / fake login | Local profile explicitly labeled. Google/email shown as unconnected; no credential capture or misleading success state. | Cloud login is not implemented. User cannot sync across devices. |
| Sensitive local storage | Only nickname, avatar index, saved public term IDs, language filter, review state and best scores persisted. Backups disabled. | AsyncStorage is unencrypted. Use a pseudonym. Future access/refresh tokens must use platform secure storage. |
| Tampered/corrupt local data | Typed allowlist parser validates known term IDs, numeric ranges, avatar/language choices; removes unknown fields and invalid records. Name strips control/format characters and is bounded. | User can alter their own local scores; these are not server-authoritative or financial entitlements. |
| Input exhaustion | Decoder enforces a 2,000 UTF-16-code-unit limit in domain logic, not just UI. Search bounded at 80 units. Decoder uses literal matching, no dynamic user regex/eval. | No benchmark on low-end hardware; content-pack scaling needs profiling. |
| Persistence ordering | Local writes queued; data deletion queued before reset state is persisted. Legacy/new keys removed on deletion. | Hardware/storage failure may prevent writes; surfaced to user. Local nickname/game resets are not an account-deletion workflow. |
| Network / permissions | No storage, overlay, vibration, contacts, camera, microphone or location permission requested. No runtime AI/auth/analytics SDK. Cleartext false; backups false. | App still has a platform-generated signature-level internal receiver permission. Verify merged manifest after dependency changes. |
| Deep links | Only static app scheme registered; no untrusted URL content is interpreted or executed. | Scheme alone is not suitable as authenticated proof. Future OAuth must validate state/PKCE/redirects and exact issuers. |
| Dependency advisories | Initial npm production graph: 2 high, 24 moderate, 1 low package nodes. PostCSS pinned 8.5.32 and image-size pinned 2.0.4. Metro compatibility adapter tested with PNG buffer; release bundle rebuilt. | Final graph: 0 critical, 0 high, 24 moderate, 1 low. Counts include propagated dependency nodes, not 25 independent vulnerabilities. Moderate glob/minimatch and low deepmerge-related chains remain. |
| Legacy framework | Expo SDK 54 / RN 0.81 compatibility baseline retained for this APK update. | Requires planned supported-SDK migration and dependency retesting before public launch. Do not force npm audit’s suggested SDK downgrade or major glob replacement. |
| Signing / supply chain | APK signature verifies; same application ID and test certificate preserve upgrade path from the earlier app. Package lock retained; no downloaded executable from unknown vendor. | HIGH for public distribution: release is signed with the standard development test key. Establish private production signing and a new controlled release process before store/public distribution. |
| Content trust | Draft dictionary labels, contextual cautions, no fabricated live popularity or certainty. | Editorial and regional review still required. No guarantee that a message means one thing. |

The npm audit is a package/advisory snapshot, not a complete native-library or OS vulnerability assessment. Build-tool dependencies such as image parsing and CSS processing primarily affect the developer pipeline; this app has no user-uploaded asset ingestion. Remaining advisories still require review and a supported-framework upgrade before production. Do not accept untrusted project files/assets into the build pipeline.

## Mandatory controls before enabling APIs

1. Use a managed identity provider. Use OAuth authorization code + PKCE and state/nonce validation, exact redirect allowlists, issuer/audience validation and system-browser flows. Do not embed OAuth client secrets in the app. Email verification/reset must resist enumeration and abuse.
2. Store refresh tokens in Keychain/Keystore-backed secure storage; keep access tokens short lived. Rotate/revoke sessions on logout/account compromise. Never store passwords or tokens with learning preferences.
3. Authenticate every private endpoint and authorize ownership server-side. Verify ID tokens on the server, enforce row ownership, test cross-user reads/writes/deletion, and separate admin/editor roles with MFA.
4. Keep AI/provider keys server-side. The client must not choose provider credentials, privileged model IDs, billing accounts or unrestricted URLs. Validate strict input/output schemas; cap body size and response size.
5. Apply server-enforced per-user/device/IP rate limits, concurrency limits, timeouts and hard spend caps. App attestation is an extra abuse signal, not authentication or authorization.
6. Treat pasted messages as untrusted content, never executable instructions. Ground AI explanations in approved dictionary meanings; test injection, ambiguous intent, offensive responses and hallucinated trend/origin claims.
7. Do not log or cache private messages. Redact request bodies/headers, auth codes, tokens and personal identifiers from traces, crash reports and errors. Verify provider retention/training settings before promising privacy. Never put messages in query-string URLs.
8. Use TLS with standard certificate verification; forbid cleartext. Do not disable certificate validation to work around networking issues. A CORS policy does not secure a native API. Certificate pinning requires a rotation/recovery design if later adopted.
9. Add idempotency/version checks for writes and offline sync, deletion/export workflows, retention schedules, backups with tested restores, incident response and budget alerts.
10. Test all controls in a staging deployment, including negative authorization tests, load/abuse tests and AI evaluations. Re-enable INTERNET only when connected functionality is implemented and reviewed.

## Verification performed

- TypeScript strict check and ten domain tests passed.
- Browser UI verified: welcome CTA, message example breakdown, all five answers in a complete round, score/XP update, next-level unlock, profile view. Browser QA is not Android-device QA.
- APK: release build, signature, package name, version, ARM64 ABI, minimum SDK, merged permissions and bundled JavaScript inspected.
- No physical/emulated Android device, full accessibility audit, dynamic traffic interception, comprehensive Maven/native CVE scan or penetration test performed.

## Primary references

- React Native security: https://reactnative.dev/docs/security
- Expo authentication: https://docs.expo.dev/guides/authentication/
- OWASP MASVS: https://mas.owasp.org/MASVS/
- Image parser advisory: https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
- PostCSS source-map advisory: https://github.com/advisories/GHSA-r28c-9q8g-f849

Raw package audit is included as `docs/dependency-audit.json` for reproducibility. No claim of zero vulnerabilities is made.
