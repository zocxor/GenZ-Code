# GenZ Code 0.3.0 — security addendum

Date: 2 November 2026. The earlier 0.2 review remains a historical baseline; this addendum covers the content expansion. No backend, authentication provider or AI gateway was added.

## Preserved controls

- No private API credentials in the app. No INTERNET permission, no ads/analytics SDK; backups and cleartext remain disabled.
- Messages and decode results remain memory-only, clear on background, and never enter learning persistence, FTS/SQLite export or source analytics.
- Existing local profile fields validated. New shuffle/daily score keys follow narrow allowlists, and score maps are bounded to 400 entries.
- Source links open only after the user chooses Open reference and only for approved HTTPS hosts. User message text is not appended to those URLs.

## Content-specific risks and controls

| Risk | Implemented control | Remaining work |
|---|---|---|
| Untrusted imported markup/scripts | Definitions rendered as native Text; no HTML injection, WebView execution, eval or runtime content script | Independently review imported meanings; text filtering is not moderation certification |
| False numeric interpretations | Standalone numeric matching is conservative; whole location phrases have explicit aliases; ordinary quantities stay literal | Many codes remain community-specific; no certainty about sender intent |
| Unicode matching errors | Normalization preserves symbols such as ℹ instead of turning them into the letter I; original text reconstructed exactly | More multilingual/code-switching evaluation on physical devices |
| API cost/key leakage | No connected API; no new network permission | Future server authentication/authorization/rate limits/AI safety remain required |
| Large-library UI slowdown | Virtualized FlatList; prebuilt index and literal matching trie; short input bounds | Measure startup/memory/search latency on low/mid-range phones; no performance certification |
| Unsafe learning suggestions | Source/verification labels; neutral generic reply where no contextual reply is authored; flagged entries excluded from discovery/quiz pools | Imported references and heuristic safety filters need editorial review before public launch |
| Database injection | SQLite export uses parameterized inserts; app currently searches a local JavaScript index | Any future runtime SQL/FTS or server API must validate and bind inputs |
| Misleading content counts | Distinct-entry manifest; overlapping categories documented; aliases not inflated; numeric shortfall explicit | More regional editors and source-backed numeric content |
| Licensing / provenance | Per-entry source/license plus notices and source hashes; no competitor bulk-copying | Recheck upstream rights and release content independently before public commercial release |

## Checks

- Strict TypeScript and 17 domain tests pass, including contextual 20 queries, ordinary numbers, original Unicode text, source metadata, quiz construction and profile schema.
- Browser verified the Search button, `20` result, phrase decoder, and recovery from category filters hiding a known match.
- SQLite integrity and row-count checks pass.
- npm audit snapshot: 0 critical, 0 high, 24 moderate, 1 low affected package nodes. This does not mean the application is vulnerability-free and is not a native/Maven CVE scan.
- Test signing and the legacy Expo/RN baseline remain public-release blockers. Physical Android execution, penetration testing, full accessibility audit and low-end performance testing were not performed here.

Refer to the final build validation record and APK manifest/signature output for package-level checks. Future real login/API services need a separate deployed-service review; UI choices are not authentication.
