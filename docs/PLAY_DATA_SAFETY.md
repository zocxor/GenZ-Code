# Google Play — Data safety form mapping (0.8.0)

Prepared from the code in this repository. The publisher must review and submit it; Google holds the publisher responsible for accuracy. Re-check after adding any SDK.

**Does the app collect or share user data?** Yes, collects (only when the user creates an account or sends content). No data is shared with third parties (Firebase acts as a service provider/processor, which Play does not count as sharing).

**Is data encrypted in transit?** Yes (HTTPS/TLS only; `usesCleartextTraffic="false"`).
**Can users request deletion?** Yes — in-app (My account → Delete account and cloud data) and on the web: `https://gen-z-code-55caf.web.app/delete-account.html` (enter this URL in Play Console → App content → Data deletion).

| Play data type | Collected? | Required/optional | Purposes | Notes |
|---|---|---|---|---|
| Personal info → Email address | Yes | Optional (account only) | Account management | Firebase Auth + support directory |
| Personal info → User IDs | Yes | Optional | Account management, Fraud prevention/security | Firebase uid on account record, submissions, security events |
| Photos and videos → Photos | **No** | — | — | Profile photo stays on the device; never transmitted (Play only counts data leaving the device) |
| App activity → App interactions | Yes | Optional | App functionality, Analytics | Saved words, scores, review schedule synced to the account; last-active day + summary counts for aggregate usage |
| App activity → Other user-generated content | Yes | Optional | App functionality | Word suggestions, content reports |
| App info and performance → Other app performance data | No | — | — | No crash/analytics SDK |
| App activity → Other actions (feedback) | Yes | Optional | App functionality | Rating + message |
| Device or other IDs | No | — | — | No advertising ID or device ID collected |
| Messages (decoder input) | **No** | — | — | Processed on device only, never stored or sent |
| Location, Contacts, Audio, Calendar, Health, Financial | No | — | — | Permissions explicitly removed in the manifest |

**Security practices to declare:** data encrypted in transit; users can request deletion. Do **not** claim an independent security review unless one is completed (this repository contains a code review, not a third-party audit).

**Permissions in the merged manifest (expected):** `INTERNET` only for dangerous/normal permissions declared by the app. CAMERA, RECORD_AUDIO, READ/WRITE_EXTERNAL_STORAGE and READ_MEDIA_IMAGES are removed with `tools:node="remove"`; verify with `aapt dump permissions` on the release build because `expo-image-picker` declares some of them.
