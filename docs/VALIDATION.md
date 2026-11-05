# GenZ Code 0.3.0 — validation

Date: 2 November 2026.

## Passed

- Strict TypeScript check and 17 domain tests.
- Search regressions: `20`, “what is your 20”, curly apostrophes, phrase variants and “what does rizz mean?” resolve correctly. Original Unicode text is preserved.
- Ordinary “I scored 20 marks” and “Call 143 tomorrow” remain literal rather than assuming secret meanings.
- Unique IDs, nonempty definitions/cautions, source metadata and honest collection counts validated.
- Daily/shuffled rounds create five distinct terms and three distinct answer options each; daily selection is deterministic for a given content version/date.
- New daily/shuffle score keys persist through profile schema validation; unrelated keys are discarded.
- Browser preview: `20` Search button returns the exact entry; Search clears a region filter hiding that match; phrase decoder produces “Where are you?”; numeric shuffle produces a question and an explanation after an answer.
- SQLite `PRAGMA integrity_check` returns `ok`; expression row count equals bundled JSON count.
- Android release build and bundled JavaScript export. APK package/signature/permissions are checked in final output files.

## Limits

No physical/emulated Android execution, full accessibility/font-scaling audit, penetration test, native/Maven CVE scan or low-end startup/memory benchmark. Browser QA does not substitute for device QA. All imported meanings are not individually editorially verified. This remains a test-signed offline build; cloud login/API services remain unconnected.

The original glassy design is retained. Reference counts and library hash are recorded in `src/data/manifest.json`, and the same manifest is included as an Android asset.
