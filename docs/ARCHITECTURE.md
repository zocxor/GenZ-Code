# GenZ Code — architecture decisions

## Boundary and truthfulness

The current deliverable is an offline native MVP. Every shipped behavior works without an external backend. Backend architecture below is a proposed implementation contract, not deployed infrastructure.

## Current layers

UI -> pure domain functions -> bundled public content.
UI -> local persistence (saved term IDs, language filter, recognition reviews).
Decoder session -> memory only; no connection to persistence.

Domain functions have no React, device, storage or network dependencies and can be tested independently. For the next iteration split App.tsx into screen components and migrate its state to a repository/context layer before adding accounts. Keeping a single orchestrator now avoids introducing unused services.

## Production backend recommendation

Use a relational database because expressions have multiple meanings, sources, translations, taxonomy tags, versions, and independent review statuses. Firebase Auth can remain the identity provider. A dedicated HTTPS API validates Firebase ID tokens and App Check attestation; authorization is enforced separately from attestation. Postgres row ownership and explicit roles protect private tables. The app never connects with service credentials.

Suggested tables:

- expressions(id, canonical_text, normalized_text, type, created_at)
- expression_variants(id, expression_id, text, language)
- meanings(id, expression_id, definition, context, sensitivity, confidence)
- translations(id, meaning_id, locale, text, status, reviewed_by, reviewed_at)
- regions / categories / expression_categories / meaning_regions
- sources(id, meaning_id, url, checked_at, reliability, reviewer_id)
- content_versions(id, content_id, payload, editor_id, timestamp)
- lessons / lesson_expressions / quiz_items
- user_progress(user_id, expression_id, dimensions, next_review, version)
- collections / collection_expressions
- submissions / moderation_events / user_reports

Separate public published content from user-owned records. Publishing the English meaning never publishes a draft translation. Editorial transition: draft -> validation -> editorial review -> regional review -> approved -> published. Only role-authorized server transitions may publish. Keep immutable audit events.

## API contract

- GET /v1/expressions?q=&language=&region=&category=&cursor=
- GET /v1/expressions/:id — published versions only
- GET /v1/content/manifest — content revision, hash and download URL
- POST /v1/reviews — authenticated, idempotent event ID, server timestamp
- GET/PUT /v1/me/preferences
- GET/POST/DELETE /v1/me/collections
- POST /v1/decode — optional AI; transient text, request size cap, strict output schema
- POST /v1/submissions — authenticated, rate-limited, unpublished by default
- POST /v1/reports
- GET /v1/me/export; DELETE /v1/me — includes queued deletion confirmation/status
- Admin endpoints: separate role-checked service and audited publishing

Return typed errors with request IDs. Redact message text, authorization headers and personal identifiers from logs. Never put decoder input in URLs, analytics, crash breadcrumbs, cache keys, traces or error bodies.

## Sync and offline

Migrate content and progress to SQLite when downloaded packs grow. Publish immutable content pack revisions; verify hash; apply transactionally; retain prior revision until successful. Queue idempotent review events offline. Server reconciles by event identity/time and content version. Local-only users keep all core functionality. Clear account data plus local caches on deletion; document backup retention.

## Decoder and AI

Current matcher preserves literal input and marks known terms with possible meanings. It deliberately does not infer mental state, relationships or sentiment. Production AI gateway retrieves published meanings, separates user text from instructions, treats pasted text as untrusted, enforces response schema, sanitizes outputs, and labels ungrounded interpretations. Rate limits and hard provider-budget caps are server-side. Common public definitions may be cached; private message content must not enter shared caches. A provider data policy must be verified before making any no-training promise.

## Security and operations

Backend-only secrets; encrypted transport; secure token storage; deny-by-default authorization; least-privilege editorial roles with MFA; per-user/IP request budgets; input/output validation; submission abuse controls; backups with restore exercises; deletion workflows; crash redaction. Test authorization by attempting cross-user reads/writes. Track search failures and review outcomes with consent-aware aggregate events, never private text. Performance targets remain unmeasured until physical-device testing.

## Web and CMS follow-on

Create a Next.js public dictionary from published content only, with canonical entry URLs and sitemap. Give translations independent indexability gates. Keep CMS in an authenticated admin application with server-enforced permissions. Neither application is shipped in this MVP.
