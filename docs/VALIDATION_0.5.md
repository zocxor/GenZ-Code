# GenZ Code 0.5.0 validation

2 November 2026.

- Supplied Firebase Android package/project match verified; no service-account credential fields found in the attachment.
- Public project-config preflight HTTP 200, correct project number; read-only, no test accounts or messages created.
- TypeScript passed; 26 tests passed including auth error redaction, credential validation and secure-storage key encoding, plus dictionary/decoder/persistence/review checks.
- Android JavaScript/Hermes export passed with the SDK's native persistence entry point. This is not an APK/AAB or native install verification.
- Web export passed. Browser checks: account screen loads, empty sign-in blocked locally, registration screen shows confirmation and privacy explanation. No credentials entered or real account operations performed.
- Targeted source secret scan: 31 source/config files checked, zero findings. Uploaded config checked separately for service-account fields.
- Dependency audit after patched gRPC override: 0 critical, 0 high, 24 moderate, 1 low affected package nodes. Full report included. Remaining findings are not waived or described as resolved.
- Firebase console configuration (provider enablement, password policy, API restrictions, quotas, App Check, actual database rules) is not privileged-audited or changed by this source update.
- Firestore and Storage deny-all rule files are included, not deployed. No cloud learning database/CMS is connected.
- Native installation, encrypted persistence/restart, real account sign-up/in/reset/verification/deletion, and production signing remain unverified. No new APK delivered.

## Native APK build follow-up

The Android internal build completed from this source with JDK 17, Gradle 8.14.3, Android SDK 36, build-tools 35.0.0, NDK 27.1.12297006 and CMake 3.22.1. The native SecureStore module is packaged.

`apksigner verify` passed and the test certificate matches earlier internal installations. Package `com.genzmode.app`, version code 5, version `0.5.0-internal`, app label GenZ Code, ARM64, bundled project `gen-z-code-55caf`, dictionary manifest 8,584 verified. ZIP integrity passed. Backups/cleartext disabled; INTERNET permission is required for optional auth. Camera, microphone, location, contacts, overlay and shared-storage permissions were not present.

This replaces the earlier no-APK artifact status, not the outstanding device/security limitations. No physical installation/update or live email account lifecycle was tested. The public debug certificate is for internal installs only.
