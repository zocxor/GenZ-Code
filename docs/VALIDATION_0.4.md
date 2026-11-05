# GenZ Code 0.4.0 restored-source validation

2 November 2026.

- `npm ci`: passed; lockfile reproducible.
- `npm run typecheck`: passed.
- `npm test`: 22 passed, zero failed. Includes corrupt-storage protection, write/delete ordering, retry recovery, export privacy and due-review tests alongside dictionary/decoder/profile tests.
- `npm run release:check`: deliberately blocks production because signing credentials and release evidence are absent. This is an expected gate failure, not a successful production release.
- Earlier internal Android compilation completed, but the workspace reset before APK verification/persistence. The restored source was rechecked with TypeScript/tests; native build was not repeated after restoration. No new APK is delivered.
- Browser checks before the reset showed the review action and learning-data export screens. Final restored source has equivalent behavior but was not independently rechecked in a browser/native runtime after restoration.
- Physical Android installation, update/migration, performance, TalkBack and penetration testing remain unperformed.
- CI is configured in source, not executed in a connected GitHub repository.
- Real Firebase/auth/backend/CMS/AI services remain disconnected or unimplemented. User selected a new Firebase project; connection is pending.

Historical 0.3 APK reports in docs apply to the unchanged previous APK, not this source revision.
