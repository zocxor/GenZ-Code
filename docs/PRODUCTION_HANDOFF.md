> Historical 0.4 handoff. Firebase email account code was added in 0.5; see FIREBASE_SETUP.md and FIREBASE_SECURITY_0.5.md for current status.

# GenZ Code — 0.4.0 source handoff

This is a hardened **offline application source**, not the completed production service requested. The approved visual design is preserved. Login, backend/CMS, AI, subscriptions, cloud sync and public website remain unimplemented or disconnected. The owner chose a new Firebase project; the Firebase connection is pending.

## Implemented

- Failed reads/invalid JSON block automatic writes instead of replacing old progress with defaults. Retry load/save actions are available.
- Writes and deletion are serialized. Deletion failure is reported; local profile reset follows successful removal.
- Render-error recovery without transmitting private messages/crash payloads.
- Due-word review connected to spaced repetition; one to five questions with explanations, without awarding review XP.
- Validated JSON export excluding private conversations and arbitrary fields.
- Separate test-signed internal and owner-signed production variants, explicit signing/readiness gates and a CI definition.

## Remaining release work

| Area | Required work |
|---|---|
| Firebase | Connect the official Firebase integration, create an owner-controlled project, configure providers, then implement/test login and private progress services |
| Backend/CMS | Authenticated API, deny-by-default authorization, editorial review/publishing, audits and backups |
| AI | Server secrets, grounded definitions, validation, rate/cost limits, no private-message retention, safety evaluations |
| Content | Most of 8,584 entries are individually unreviewed imports. Numeric collection has 162, not 500. Regional/language/editorial review required |
| Learning | Full curriculum, placement, contextual mastery and lesson resume remain beyond four stages/shuffle/daily/recognition review |
| Web/premium/community | SEO companion, store entitlements, source-backed trends and moderation remain |
| Devices | Physical low/mid-range installation/update, TalkBack, large text, RTL, offline restart and performance testing |
| Dependencies | Supported-stack migration and native dependency scan; existing Expo 54/RN 0.81 baseline has known moderate/low findings |
| Operations/legal | Publisher-approved policy URLs, support contact, store declarations, privacy-aware monitoring, rollback and incident response |
| Signing | Publisher-owned private upload key and Play Console setup |

## Building

`npm ci`, `npm run typecheck`, `npm test`.

Use JDK 17 and the SDK/NDK versions in the native project. Device test build: `cd android && ./gradlew assembleInternal -PreactNativeArchitectures=arm64-v8a`. This retains the public test key for existing test-install updates; it is not a store release.

Production requires `GENZ_UPLOAD_STORE_FILE` (absolute private path), `GENZ_UPLOAD_STORE_PASSWORD`, `GENZ_UPLOAD_KEY_ALIAS`, `GENZ_UPLOAD_KEY_PASSWORD`. Keep keys/passwords outside source and public Expo variables. Record real completed evidence under `docs/release-evidence/` in `production-readiness.json`, then `npm run release:check` and `cd android && ./gradlew bundleRelease`.

The gate checks recorded evidence exists; it does not certify the quality of that evidence. A new production certificate cannot directly update a test-signed install. Plan migration before public release. The maintained native project is authoritative; Expo prebuild must preserve the signing guard/internal variant.

Official Android signing reference: https://developer.android.com/studio/publish/app-signing

## Validation and artifact availability

Earlier in this session, the hardening changes passed TypeScript and 22 tests, and the internal Android build completed. Browser checks showed review and export screens working. The workspace then reset before the APK could be verified/saved. Source was restored and the changes reapplied; final restored-source checks are recorded in VALIDATION_0.4.md. No new 0.4 APK is delivered from this session; the previously saved 0.3 APK remains unchanged. Historical APK/signature reports in this archive refer to 0.3, not this source revision.
