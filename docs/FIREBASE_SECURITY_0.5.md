# GenZ Code — Firebase and API security review, 0.5.0

Date: 2 November 2026. Project: `gen-z-code-55caf`. Android package: `com.genzmode.app`.

## Verified locally

- Supplied file matches project/package. It contains Firebase client configuration, not service-account private keys. Google OAuth clients are absent.
- Firebase public project-config request returned HTTP 200 and matching project number. This read-only test created no accounts and sent no email. It does not prove Email/Password is enabled or that admin security settings are correct.
- Official Firebase JS SDK 13.1.0 handles email authentication, token refresh, sign-out and account deletion. Session persistence uses Expo SecureStore 15.0.8 through the SDK's React Native persistence adapter. No hand-written JWT verification or password database.
- Web authentication is memory-only. Native encrypted persistence is attempted; the SDK can fall back to memory if secure storage is unavailable. Native restart/device-lock/keychain behavior still requires physical-device testing. Storage errors are not treated as successful persistence.
- Passwords/confirmation clear after operations, mode changes and app backgrounding. The account screen unmounts when closed. User inputs are not logged. UI errors use a fixed safe mapping instead of raw Firebase responses.
- Authentication state comes from Firebase; no fake sign-in success. Email verification status is reloaded from the provider. Deletion uses the provider's recent-login requirement and a user confirmation.
- Learning data is separate from account sessions, not automatically uploaded, and may be shared by users of this device. The UI explains that cloud progress sync is not implemented. Account deletion does not claim to delete local learning data; local deletion does not claim to remove Firebase accounts.
- INTERNET permission is now required for optional authentication. Backups and cleartext remain disabled. No contacts/location/storage permissions were added. Dictionary/decoder operate without sign-in; pasted messages are not sent to Firebase.
- No Firebase Analytics, ads, AI provider, Firestore client or Storage client is initialized. AI/private backend keys are absent from the source.
- Deny-all Firestore and Storage rules are supplied as a safe starting point, **not deployed**. Existing production rules have not been inspected. Do not treat the file as protection for an already-live database until reviewed and deployed.
- Existing production-signing guard remains. Internal test certificate is unsuitable for public distribution.

## API key handling

Firebase client API keys identify the project and are designed to ship in client apps. Obfuscating them is not access control. This uploaded key is included only as Firebase client configuration. No admin credential belongs in a mobile bundle. Database authorization must be enforced server-side by reviewed Security Rules or an authenticated backend.

Owner must inspect Google Cloud API-key restrictions: allow only services required by the chosen Firebase client, particularly Identity Toolkit and Secure Token, and remove unrelated expensive APIs from this key's scope. Preserve existing compatible restrictions; do not indiscriminately remove application restrictions to make an error disappear. This implementation uses Firebase JS Auth inside React Native, not the native Android Firebase Auth SDK. Android package/SHA application restrictions must be validated against that client; native-only restrictions can reject JS SDK requests. Use separate appropriately restricted keys for other APIs.

Owner must configure Authentication password policy and email-enumeration protection, verify API quotas, configure abuse controls and monitor unusual sign-up/reset traffic. Client button disabling/validation is usability, not a security rate limit. App Check is not configured; no claim that bots are prevented. Future custom APIs must verify Firebase ID tokens, enforce authorization/rate/cost limits, validate input, and keep AI secrets server-side.

## Release limitations

Live account sign-up/sign-in/reset/verification/deletion were not exercised against the user's real project, and no emails were sent by this review. Google OAuth/signing fingerprints are not configured. No privileged console access was available to audit or change actual rules, quotas, App Check, API restrictions or billing.

TypeScript and 26 domain tests pass. Android bundle export passes; this is not an installable APK or a native device security certification. A targeted source secret scan has no findings. The dependency audit report is separate; no guarantee of zero vulnerabilities or completed MASVS/penetration testing.

## Primary references

- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/reference/js/auth#getreactnativepersistence
- https://docs.expo.dev/versions/latest/sdk/securestore/
- https://firebase.google.com/docs/auth/web/manage-users

## Dependency outcome

The first expanded audit reported four high-severity affected-package nodes via Firebase’s unused Firestore dependency chain and @grpc/grpc-js 1.9.16. The upstream certificate-validation advisory lists 1.13.6 and 1.14.5 as fixed. An explicit override to 1.14.5 removed those high findings in the repeat audit. Firestore is not initialized or used by this app; the override changes the install tree, not a deployed server. Revalidate it when updating Firebase or adding Firestore.

Final audit snapshot: **0 critical, 0 high, 24 moderate, 1 low** affected package nodes. Moderate/low Expo/Metro legacy findings remain; the project is not vulnerability-free. The snapshot is npm dependency coverage, not native/Maven or live-cloud penetration testing.

Upstream advisory: https://github.com/advisories/GHSA-m9gg-hp2v-232j
