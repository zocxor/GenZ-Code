# Building the GenZ Code APK (0.8.0)

0.8.0 adds two native modules (`expo-image-picker`, `expo-image-manipulator`), so the APK must be rebuilt from this source. A JavaScript-only update is not enough.

## Option A — GitHub Actions (no local setup)

1. Push this project to a **private** GitHub repository.
2. GitHub → **Actions** → **Android APK** → **Run workflow** (keep the default ABIs).
3. After about 20–40 minutes, open the run → **Artifacts** → download `genz-code-0.8.0-internal-apk`. It contains `app-internal.apk` and `apk-report.txt` (signature, package/version, permissions, SHA-256).

The workflow also runs typecheck, unit tests and the security scan, and fails if the APK contains camera, microphone or storage permissions.

## Option B — your own computer

Prerequisites: Node 22, **JDK 17**, Android Studio with SDK Platform 36, Build-Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1 (Android Studio → SDK Manager → SDK Tools → "Show package details"). Set `ANDROID_HOME` (Windows: `%LOCALAPPDATA%\Android\Sdk`; macOS: `~/Library/Android/sdk`).

```bash
npm ci
npm run typecheck && npm test
cd android
./gradlew assembleInternal -PreactNativeArchitectures=arm64-v8a,armeabi-v7a     # Windows: .\gradlew.bat …
```

Output: `android/app/build/outputs/apk/internal/app-internal.apk`. Install it with `adb install -r app-internal.apk`, or copy it to the phone.

Do **not** set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` when building. If you have ever built with it set, clear the Metro cache first: `npx expo start --clear`, then stop it.

## Which signing key?

| Build | Signed with | Use for | Updates |
|---|---|---|---|
| `assembleInternal` (APK) | Project internal test key (`android/app/debug.keystore`) | Testers, sideloading | Installs **over** earlier internal builds; data is kept |
| `bundleRelease` (AAB) | **Your upload key** (`GENZ_UPLOAD_*` variables / GitHub secrets) | Google Play | Blocked by `npm run release:check` until every gate in `production-readiness.json` has evidence |

Important for testers' data: Android refuses to update an app signed with a different certificate, so moving from an internal (test-key) install to a Play or upload-key build requires uninstalling, which deletes device-only data. From 0.8.0, testers who sign in keep their learning data in their account and get it back after reinstalling. Ask testers to sign in before you switch them to Play builds. For seamless updates afterwards, distribute through a Play **internal testing** track.

GitHub secrets for `release-aab`: `GENZ_UPLOAD_KEYSTORE_BASE64` (output of `base64 -w0 your-upload.keystore`), `GENZ_UPLOAD_STORE_PASSWORD`, `GENZ_UPLOAD_KEY_ALIAS`, `GENZ_UPLOAD_KEY_PASSWORD`. Never commit the keystore or passwords.

## After installing: device checklist

Save a word → force-stop → reopen → it is still saved. Finish a quiz → reboot the phone → the score is still there. Turn on airplane mode, make changes, turn it off → "Backed up" appears. Pick a profile photo (no permission prompt should appear). Sign in on a second phone → saves sync across. Install the next build over this one → data is kept.
