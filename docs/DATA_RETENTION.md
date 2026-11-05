# GenZ Code — data categories, retention and deletion (0.8.0)

Status legend: **Automated** = enforced by code/configuration in this repository once deployed. **Owner process** = the publisher must operate it; nothing in the code does it automatically.

| # | Category | Where | Contents | Retention | Deletion path | Status |
|---|---|---|---|---|---|---|
| 1 | Public slang content | APK (bundled 8,584 entries) + `publishedContent` | Terms, meanings, sources | Indefinite. CMS history in `content/{id}/versions` kept indefinitely | Archive in CMS (soft delete, history kept) | Automated |
| 2 | Local preferences | Device (AsyncStorage `genz-code-v3`, app-private) | Language filter, quiz category, search-history switch | Until user deletes or uninstalls | Threat Shield → Delete all data on this device; uninstall | Automated |
| 3 | Learning progress | Device; if signed in also `users/{uid}/sync/{profile,saved,progress,scores}` | Saved word IDs, scores, round history (last 200), review schedule, streak days (last 400) | Until user deletes; resets via watermarks propagate to all devices | In-app resets; account deletion deletes cloud copy immediately | Automated |
| 3a | Device-only history | Device only | Recently viewed (30), searches (20, opt-in), profile photo (320 px JPEG) | Until cleared/deleted/uninstalled | Threat Shield → Clear browsing history; Edit profile → Remove photo; Delete all data | Automated |
| 4 | Account information | Firebase Authentication; `directory/{uid}` (e-mail); `users/{uid}` (metadata) | E-mail, password hash (Firebase-held), sign-up/last-active, app version, platform, summary counts | Until account deletion | In-app or web deletion: directory + data deleted immediately; `users/{uid}` becomes a tombstone (uid + timestamps) | Automated |
| 4a | Deletion tombstone | `users/{uid}` | `status: deleted`, timestamps | Until Auth account deletion is confirmed; target ≤ 30 days | Super Admin purges in portal (Users → status "Deletion tombstones") after confirming the Auth account is gone | **Owner process** |
| 5 | User-submitted content | `submissions`, `reports`, `feedback` (with uid) | Suggestion text, report reason/note, rating/message | Until the account is deleted; otherwise reviewed periodically | Deleted with the account (owner's own docs). Accepted suggestions become CMS content **without** uid | Automated (on deletion); periodic purge = **Owner process** |
| 6 | Security logs | `securityEvents` + device log (last 50) | Type, short code, uid, platform, app version, server time | **90 days** (Firestore TTL on `expireAt`) | TTL; device log cleared with local data | Automated once TTL policy is enabled |
| 7 | Analytics | — | No analytics SDK. Dashboard figures are aggregate queries over `users/{uid}` metadata | n/a | n/a | — |
| 8 | Administrative records | `auditLogs`, `admins`, `users/{uid}/supportNotes` | Actor uid, role, action, target path, short summary | Audit logs **365 days** (TTL); support notes until account deletion review | TTL; Super Admin can delete notes | Automated (TTL) / **Owner process** (notes) |
| 9 | Backups | Firestore PITR / scheduled backups | Copies of all of the above | Recommended: PITR 7 days, scheduled backups 14 days | Expire automatically | **Owner configuration** |

## Rules that make deletion trustworthy

- Cloud data is deleted in **one atomic batch** together with the tombstone; Firestore rules only allow deleting sync/limit/directory documents when the same batch marks the account deleted (`deletedAfter()`), so data can't be orphaned half-way.
- The sign-in account is deleted **only after** cloud deletion succeeds. If cloud deletion fails, nothing is deleted and the user is told so (verified in `tests-e2e/auth.mjs`).
- Re-authentication with the password is required before deletion.
- Local deletion never claims to delete cloud data, and account deletion asks separately whether to delete this device's data.
- Suspended users can still delete their account (tombstone path is allowed for any status).

## Owner actions to make the automated items real

1. `firebase deploy --only firestore:indexes` — this also creates the TTL policies on `securityEvents.expireAt` and `auditLogs.expireAt` declared in `firebase/firestore.indexes.json`. Confirm in the console (Firestore → Time-to-live).
2. Enable point-in-time recovery (7 days) and a scheduled backup with 14-day retention, then update the privacy policy's backup line.
3. Calendar a monthly task: purge tombstones whose Auth account is gone; review and delete rejected suggestions / resolved reports / triaged feedback older than the period stated in the privacy policy.
