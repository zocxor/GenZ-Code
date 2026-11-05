# Admin portal & Firebase backend — setup and operations (0.8.0)

The portal is a separate web app (`admin/`), hosted on Firebase Hosting at `/admin/`. No admin code or credential ships in the mobile APK. All permissions are enforced by `firebase/firestore.rules`; the portal UI only hides what a role cannot do.

## One-time setup (project owner)

1. **Test the rules first** (needs Java 21+): `npm i -g firebase-tools && npm run test:rules`. Do not deploy rules that fail.
2. **Upgrade Authentication to Identity Platform** and enable **TOTP multi-factor** (Console → Authentication → Settings → Multi-factor authentication → TOTP). Admin access is impossible without it: rules require `sign_in_second_factor` for every admin request.
3. In Authentication settings enable **email enumeration protection**, set the **password policy** (12+ characters to match the app), and review **authorized domains** (keep `gen-z-code-55caf.web.app`).
4. Deploy: `firebase deploy --only firestore:rules,firestore:indexes` then `cd admin && npm ci && npm run build && cd .. && firebase deploy --only hosting`.
5. Confirm the TTL policies (Firestore → Time-to-live): `securityEvents.expireAt`, `auditLogs.expireAt`.
6. **Bootstrap the first Super Admin** (console writes bypass rules by design): create an account in the app or portal, copy its UID from Authentication, then in Firestore create `admins/<UID>` with `{role: "super_admin", active: true, email: "<email>", updatedAt: <now>, updatedBy: "console", lastAuditId: "bootstrap"}`. Sign in at `/admin/`, verify your e-mail, enrol an authenticator app, sign in again. Add a **second** Super Admin from the portal (nobody can edit their own role).
7. Create `config/app` from Settings in the portal (UGC on/off, content updates on/off).
8. Enable PITR / scheduled backups (see DATA_RETENTION.md) and Cloud Billing budget alerts.
9. Restrict the Firebase API key in Google Cloud (Identity Toolkit, Token Service, Cloud Firestore only) — see FIREBASE_SECURITY_0.5.md for the JS-SDK caveats.
10. Strongly recommended: enable **App Check** (Play Integrity) for Firestore once a native App Check provider is added; not configured in this release.

## Roles

| Role | Can |
|---|---|
| Super Admin | Everything, including roles, settings, audit and security logs, account deletion processing |
| Content Manager | Create/edit/import/export content, submit for review, publish/archive/roll back, review suggestions, moderate reports |
| Moderator | Read content, review suggestions, moderate reports, read accounts (no e-mail), suspend/reactivate |
| Support Admin | Read accounts incl. e-mail and learning history, support notes, suspend/reactivate, process deletion requests, triage feedback |
| Analyst | Dashboard aggregates, read content, export content, read feedback. No e-mail or learning data |

## What is enforced on the server (rules) vs. done in the console

| Action | Where |
|---|---|
| Role checks, MFA requirement, field validation, ownership | Firestore rules |
| Audit entry for every privileged write (same batch, same actor/target/time) | Firestore rules (`audited()`) |
| Publish only after review; public copy written in the same batch; history immutable | Firestore rules |
| Rate limits: sync writes ≥2 s, activity ≥20 s, submissions ≥60 s, security events ≥10 s | Firestore rules |
| Suspend (blocks sync + submissions) | Portal → rules |
| **Disable sign-in** for a suspended user | Firebase Console → Authentication (no Cloud Functions in this release) |
| **Delete the Authentication account** after processing a deletion request | Firebase Console → Authentication |

Optional upgrade: a small Cloud Functions codebase (Blaze plan) could disable/delete Auth users from the portal and compute nightly aggregate stats; intentionally not added because it requires a paid plan and an owner decision.

## Operations checklist

- Weekly: review Security events (admin_access_denied, sync_permission_denied spikes) and open reports.
- Monthly: purge deletion tombstones whose Auth account is gone; apply the retention periods in DATA_RETENTION.md.
- Each release: `npm run security:scan`, `npm audit --omit=dev`, `npm run test:rules`, and build with `--clear`.
