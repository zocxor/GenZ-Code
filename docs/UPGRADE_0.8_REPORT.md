# GenZ Code 0.8.0 — Implementation report

Date: 5 November 2026 · Source baseline: 0.7.0 (branding) on the 0.5.0 codebase · Package `com.genzmode.app`, versionCode 8.

**Bottom line.** The data-saving defects are fixed at the root and verified in a browser across close/reopen, corruption and offline scenarios. Cloud sync, account deletion, the Secure Engine/Threat Shield layer, Firestore security rules, the admin portal and CMS are implemented. **Not yet verified:** the Firestore rules and every Firestore-backed path (no Firestore emulator could be downloaded in the build environment), and the native Android build on a device (no Android SDK there). The app is **not yet Google Play ready**; section 15 lists exactly what remains.

---

## 1. Existing architecture discovered

- Expo SDK 54 / React Native 0.81 (new architecture, Hermes), maintained native `android/` project with signing guards; `App.tsx` as a single orchestrator.
- Content: 8,584 bundled entries in `src/data/library.json` (+ SQLite export), pure search/decoder engine.
- Local data: **one unversioned JSON blob** in AsyncStorage (`genz-code-v2`), written by a `useEffect` on every state change.
- Backend: Firebase project `gen-z-code-55caf`, **Authentication only** (email/password, JS SDK, SecureStore session persistence). Firestore/Storage rules were deny-all and not deployed. No sync, CMS, admin portal or server code.
- Implemented ✅: dictionary, decoder, 4 levels + shuffle/daily quizzes, spaced review, saves, local profile, email accounts, export, local deletion. Partial ⚠️: persistence (see §3), privacy screen (static text). Missing ❌: history/recent/attempts/streaks, cloud sync, admin, CMS, security events, retention policy, web deletion page.

## 2. Storage problems identified

1. Unknown term IDs silently dropped on load (`parseProfile`), then overwritten by the next autosave.
2. UI updated before persistence; write failures only showed a generic banner while the UI kept showing unsaved data.
3. A corrupt record put the app into permanent read-only "recovery mode" (all progress temporary) with no backup or way out except deleting everything.
4. No schema version or migration path.
5. No cloud backup and `allowBackup=false` → any uninstall/reinstall lost everything.
6. Quiz category, recently viewed, search history, round history and streaks were not persisted at all.
7. `App.tsx` ran a full 8,584-entry search on every render for an unused variable, slowing every state change (including saves).
8. On web, `Alert`-based confirmations were no-ops, so "Delete my local data" did nothing.

## 3. Root causes of data-saving failures (what testers most likely saw)

- **Reinstalling between differently signed builds.** Internal builds are signed with the debug key; your new production key is a different certificate, so Android refuses to update — you must uninstall, and with backups disabled and no cloud copy all learning data is lost. *Fix:* cloud sync for signed-in users; uninstall behaviour is explained in the app (Threat Shield, account screen). Plan the certificate switch before external testers rely on their data.
- **Silent destructive filtering (#1)** made saves disappear permanently whenever content IDs changed. *Fix:* records are preserved by ID format and only hidden in the UI (`src/profile.ts`), verified by test.
- **Optimistic, unconfirmed writes (#2).** *Fix:* `LearningRepository.mutate()` writes first and publishes to the UI only after the write resolves; on failure the state is unchanged and the user is told.
- **Corruption lock-out (#3).** *Fix:* checksum + backup slot + quarantine (see §6).

## 4. Files and components modified / added

Modified (upgraded in place, same screens and design): `App.tsx` (wired to the repository; You tab → dashboard; privacy sheet → Threat Shield), `src/profile.ts` (schema v3), `src/storage.ts` (durable store), `src/engine.ts` + `src/content.ts` (rebuildable index, content overlay), `src/reviewQueue.ts`, `src/AccountScreen.tsx`, `src/DictionaryScreen.tsx`, `src/TermDetail.tsx`, `src/ui.tsx`, `src/auth/client.ts`, `src/auth/policy.ts`, `firebase/firestore.rules`, `firebase.json`, `AndroidManifest.xml`, `app.json`, `build.gradle`, `package.json`, scripts, CI, tests.

Added — app: `src/learning.ts` (pure transitions), `src/repository.ts`, `src/services.ts`, `src/sync/{engine,merge,firestoreCloud}.ts`, `src/secure/{config,logger,events,integrity,session}.ts` (Secure Engine), `src/shield/{loginGuard,status}.ts` + `src/ThreatShieldScreen.tsx` (Threat Shield), `src/contentSync.ts`, `src/ugc.ts`, `src/SubmitForms.tsx`, `src/ProfileDashboard.tsx`, `src/NavBar.tsx`, `src/avatarPhoto.ts`, `src/firebase/app.ts`, `shared/contentSchema.ts`.
Added — backend/portal: `firebase/firestore.indexes.json`, `firebase/rules-tests/rules.test.mjs`, `admin/` (portal + public privacy/deletion pages), `tests-e2e/`, docs (`ADMIN_PORTAL.md`, `DATA_RETENTION.md`, `PLAY_DATA_SAFETY.md`, this report), `.github/dependabot.yml`.

UI requests during the session: **elegant profile dashboard** (hero with rank/XP, streak/XP/saved/mastered tiles, 7-day activity, learning path, recent rounds, badges, recently viewed — all from real data); **profile photo upload** (system photo picker → square crop → 320 px JPEG, device-only); **navigation bar** upgraded to a floating dock in the existing colours with a real review-due badge, plus a fix for the badge/content overlap you spotted.

## 5. New dependencies

| Package | Where | Why | Note |
|---|---|---|---|
| `expo-image-picker` ~17.0.11 | app (native) | Profile photo | **Requires a native rebuild.** Its CAMERA/storage permissions are stripped in the manifest |
| `expo-image-manipulator` ~14.0.8 | app (native) | Crop/downscale photo | Native rebuild |
| `firebase/firestore/lite` | app | Sync, content delivery, submissions | Already inside `firebase`; REST-only Lite build chosen to limit size |
| `@firebase/rules-unit-testing` 6.0.0 | dev | Rules tests | |
| `vite` 7, `react` 19.1, `firebase` 13.1, `qrcode` 1.5.4 | `admin/` only | Portal | gRPC override 1.14.5 (same as the app) → 0 advisories |

Android JS bundle: 6.26 MB → 6.81 MB (+0.55 MB, +8.8%).

## 6. Database changes

**Local (device):** `genz-code-v3` = `{v, savedAt, sum (FNV-1a), data}`; `genz-code-v3.bak` = previous good write (committed in the same AsyncStorage `multiSet` transaction); `genz-code-quarantine.<ts>` (max 3) for unreadable records; separate keys for security log, login guard, content overlay cache and profile photo.
**Firestore (new):** `users/{uid}` (no e-mail), `users/{uid}/sync/{profile|saved|progress|scores}`, `users/{uid}/limits/{ugc|sec}`, `users/{uid}/supportNotes/*`, `directory/{uid}` (e-mail, restricted), `admins/{uid}`, `auditLogs/*` (TTL 365 d), `securityEvents/*` (TTL 90 d), `config/app`, `content/{id}` + `versions/{n}`, `publishedContent/{id}` (public), `submissions/*`, `reports/*`, `feedback/*`. Indexes and TTL in `firebase/firestore.indexes.json`.
**Sync model:** per-record last-writer-wins with a hybrid logical clock, tombstones for removals, watermarks for bulk resets, monotonic best scores, bounded unions for attempts/days. Each domain syncs through a server transaction (read → merge → write only if changed); a domain is marked clean only when the server confirmed it and no newer local change arrived.

## 7. Data migration requirements

Automatic on first launch of 0.8.0: v2 (`genz-code-v2`) or v1 (`genz-mode-v1`) → v3, preserving order of saves, scores, review progress, name, avatar and language; legacy keys are removed **only after** the v3 write is confirmed (tested). No server migration (all collections are new). Owner steps: see `docs/ADMIN_PORTAL.md` (rules test → deploy rules/indexes/hosting → TOTP MFA → first Super Admin).

## 8. Admin portal functionality implemented

Sign-in with **mandatory TOTP two-step verification** (enrolment flow included), per-tab session, 30-minute idle sign-out, denied attempts logged. **Dashboard** from live aggregation queries: registered/DAU/WAU/MAU/new users, suspended, learning activity, retention (D1/D7/D30, defined on screen), app-version share, slang DB stats, pending suggestions/open reports/feedback & average rating, security events. **Users:** search (UID; e-mail prefix for PII roles), status filter, sort, pagination, detail with learning stats and quiz history, suspend/reactivate with reason, support notes, deletion processing. **CMS:** all 8,584 bundled entries browsable/searchable/filterable; create/edit with validation and duplicate detection; draft → review → publish; archive; immutable version history with rollback; CSV/JSON import (validation, sanitisation, in-file and library duplicate detection, drafts only); CSV/JSON export with formula-injection protection; published entries reach the app without an APK update. **Moderation:** suggestions → CMS drafts, reports resolve/dismiss, feedback triage. **Audit & security logs**, **Admins & roles** (5 roles, no self-edit), **Settings** (UGC kill switch, content-delivery switch).

## 9. Security controls implemented

Secure Engine: redacting logger (silent in production), shared input validation, integrity checksums, secure-storage session (existing SecureStore), session expiry handling on foreground, security-event recording (minimised, rate-limited, 90-day TTL), secure config (no secrets; emulator flag ignored by native release builds). Threat Shield: persistent sign-in throttle (3 free attempts, then 30 s doubling to 15 min), 8 real status checks with "passed / applicable" summary, privacy controls (search history opt-in, clear history, resets, export, delete local data, account deletion). Server: deny-by-default rules with ownership checks, MFA-gated RBAC, rules-enforced audit logging, schema/size validation, server-time stamps, rate limits, suspension enforcement, public/draft separation. Hosting: strict CSP, HSTS, frame-ancestors none, no-referrer, Permissions-Policy. Android: CAMERA/RECORD_AUDIO/storage/media permissions removed, cleartext and backups disabled.

## 10–11. Security findings (threat model) and resolution status

| # | Threat | Sev. | Component | Impact | Mitigation | Status | Verification |
|---|---|---|---|---|---|---|---|
| 1 | Cross-user data access (IDOR) | Critical | Firestore | Read/alter others' learning data | Owner-only rules on `users/{uid}/**`; uid from token | Implemented | Rules test written, **not executed** |
| 2 | Unauthorised admin access | Critical | Portal, rules | Full data/content control | Role doc + active flag + **MFA claim** checked server-side; no self-role edits | Implemented | Portal gate fails closed (browser test); rules **not executed** |
| 3 | Admin actions without accountability | High | Rules | Undetectable abuse | Audit entry required in the same batch (actor/target/time) | Implemented | Rules test **not executed** |
| 4 | Self-reactivation / status tampering | High | Rules | Bypass suspension | Owner cannot change `status`; tombstone blocks recreation | Implemented | Rules test **not executed**; sync engine blocks (unit test ✅) |
| 5 | Data loss on content updates | High | Local storage | Permanent loss of saves | Preserve unknown IDs | **Resolved** | Unit + browser tests ✅ |
| 6 | Corrupt local record locks app | High | Local storage | All progress temporary | Checksum, backup, quarantine | **Resolved** | Unit + browser tests ✅ |
| 7 | Brute-force / credential stuffing | High | Auth | Account takeover | Firebase server throttling; client guard; non-enumerating errors; owner: enumeration protection | Implemented (client) / owner config | Auth-emulator test ✅ |
| 8 | Malicious imported/submitted content | High | CMS, app | XSS in portal, broken app, formula injection | Shared schema, control/bidi stripping, HTML/script rejection, React-escaped rendering, CSV cell neutralising, app re-validates published data | Implemented | Unit tests ✅ |
| 9 | Session theft | Medium | App | Account misuse | SecureStore session, token revalidation, sign-out clears session; portal session per tab + idle timeout | Implemented | Partially (web); **native not device-tested** |
| 10 | API abuse / spam | Medium | Firestore | Cost, junk data | Rules rate limits, account-active checks, kill switch | Implemented | Rules **not executed**; App Check **not configured** |
| 11 | Sensitive data in logs | Medium | App/portal | PII leakage | Redacting logger, no prod console, events carry no PII | Implemented | Unit-level + scan ✅ |
| 12 | Account enumeration | Medium | Auth | Target discovery | Generic errors; owner must enable enumeration protection | Partial (owner) | Browser test ✅ (generic message) |
| 13 | Excessive permissions | Medium | Android | Privacy/Play rejection | Explicit removals | Implemented | Static scan ✅; merged manifest **not built** |
| 14 | Dependency vulnerabilities | Medium | npm | Supply chain | Overrides, CI audit, Dependabot | App: 0 high/critical (11 moderate, 1 low Expo/Metro chain); portal: 0 | `npm audit` ✅ |
| 15 | Trojan-Source / hidden characters | Low | Source | Review bypass | Scanner check | Implemented | Planted-sample test ✅ |
| 16 | Release built with emulator config | Medium | Build | Broken/insecure release | Native builds ignore the flag; release gate fails if set; `--clear` | **Resolved** (found during testing) | Bundle grep ✅ |
| 17 | Bots without App Check | Medium | Backend | Abuse at scale | Rules limits only | **Open** | — |
| 18 | Profile photo exposure | Low | App | Personal image leak | Device-only, never uploaded, deleted with local data | Implemented | Browser test ✅ |

No critical/high finding is known to be *open in the code*; however #1–#4 and #10 are **unverified until the rules tests run**, so they must be treated as open for release purposes.

## 12–13. Tests performed and results

| Suite | Result |
|---|---|
| App unit tests (`npm test`) — storage, migration, corruption, sync merge/convergence/offline/account switching/suspension/deletion, streaks, existing domain tests | **47/47 pass** (was 26) |
| Admin unit tests — CMS merge, duplicate detection, import validation/sanitising, CSV, IDs, retention maths, RBAC matrix | **8/8 pass** |
| Browser: persistence (save → close/reopen, profile edit, corruption recovery, quarantine, local deletion) | **18/18 pass** |
| Browser: profile photo (pick, 320×320 crop, persists, not in synced record, deletion) | **8/8 pass** |
| Browser + **Firebase Auth emulator**: sign-up, offline sync honesty, sign-out choices, wrong password, throttle persistence, Threat Shield flag, safe deletion, re-auth | **15/15 pass** |
| Browser: admin portal under production CSP, public pages, fail-closed gate | **10/10 pass** |
| TypeScript (app + portal) | Pass |
| Android Hermes bundle (`expo export --clear`) | Pass |
| Security scan (79 files) + planted-sample check | 0 findings; detector verified |
| `npm audit` | App 0 high/critical; portal 0 |
| **Firestore rules tests (18)** | **Written, not executed** — emulator binary not downloadable here |
| **Firestore integration** (sync adapter, content delivery, submissions, portal data) | **Not executed** against Firestore |
| **APK build / device tests** (restart, force-stop, reboot, update, account switching, offline) | **Not performed** — no Android SDK/device here |
| Performance (startup, memory, jank) | Not measured on device; bundle +8.8%, cloud start deferred until after first render |

Bugs found and fixed by these tests: sign-out left the form in "Create account" mode; nav badge covered the icon and content was cut at the dock; emulator flag could survive in Metro's cache.

## 14. Remaining limitations (exact next actions)

1. **Run `npm run test:rules`** (Java 21 + firebase-tools) and fix any failure before deploying rules. Then exercise sync/CMS against the emulator (`firebase emulators:start --only auth,firestore` + the emulator web build).
2. **Build and install on a device:** `cd android && ./gradlew assembleInternal -PreactNativeArchitectures=arm64-v8a` (new native modules), then run the device checklist in §13; verify merged permissions with `aapt dump permissions`.
3. Enable Identity Platform TOTP MFA, enumeration protection, TTL, backups; bootstrap the first Super Admin (docs/ADMIN_PORTAL.md).
4. No Cloud Functions: disabling sign-in and deleting Auth accounts for admin-processed requests are console steps.
5. App Check not configured. Google sign-in not configured. No NetInfo: reconnection is detected by retry back-off (5 s → 15 min) and app foreground.
6. Not implemented (no fake settings shown): notifications, dark theme, user-created collections (saved words cover favourites/bookmarks), cross-device profile photo.
7. Dashboard "active users" counts signed-in accounts only (no analytics SDK by design).
8. Privacy policy has publisher placeholders; content editorial review of imported entries is still outstanding.

## 15. Google Play readiness

**Not ready.** Blocking: rules tests + Firestore integration test; signed release build and physical-device QA; publisher identity, support e-mail and completed privacy policy; Data safety form (draft in `PLAY_DATA_SAFETY.md`); console security configuration (MFA, enumeration protection, App Check recommended); content editorial review; signing-certificate migration plan for existing testers. Ready: account deletion in-app and on the web, permission minimisation, encrypted transport, deletion/retention design, release gate scripts.
