# GenZ Code Firebase setup

Project ID: `gen-z-code-55caf`. Supplied Android config matches `com.genzmode.app`. The app remains branded **GenZ Code**.

Email/password account code is now implemented using the Firebase JS SDK. The Android registration JSON is retained under android/app and its public API key/project ID are consumed by the JS client config. Google Services Gradle plugin/native Firebase Auth are not used by this JS integration. No Firebase web app registration is required for the current email-only client options (apiKey/projectId); popup/redirect providers are not implemented.

1. In Firebase Console → Authentication, initialize the service if necessary and enable Email/Password. Configure an appropriate password policy and review email templates. The app requires at least 12 characters when creating a new account; existing shorter passwords can still sign in.
2. Check API restrictions and email-enumeration protection using FIREBASE_SECURITY_0.5.md. A public config preflight succeeded, but provider and security settings cannot be established from the uploaded file alone.
3. Build the maintained Android project using the existing internal build instructions. Test creating a disposable account yourself, sending verification, checking status after opening the email link, signing out/in, password reset, app restart and account deletion. Web auth is memory-only. Do not paste passwords into chat.
4. Google sign-in remains unavailable: configure the intended signing certificate SHA-1/SHA-256 and Google provider/OAuth clients before implementing/testing its login flow. A client ID is not sufficient without the native/browser flow and audience checks.
5. Cloud progress and CMS are not implemented. Deny-all Firestore/Storage rule files are provided but not deployed. Review any existing rules before enabling these services; do not deploy an open test-mode database.

The client config includes a public Firebase API key by design. Keep service-account keys and AI-provider keys out of app source. An internal ARM64 APK was built and package-verified after the initial source handoff. See APK_BUILD_0.5.json and VALIDATION_0.5.md; live account/device tests remain required.
