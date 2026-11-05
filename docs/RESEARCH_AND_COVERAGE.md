# GenZ Code 0.3.0 — research and coverage

Research date: 2 November 2026. Research used public app listings, publishers’ help pages, dictionary references and openly reusable datasets. Competitor functionality below is advertised by its publisher, not independently installed/benchmarked.

## What the screenshots revealed

The approved design was not the central problem. The 30-entry seed could not answer a legitimate lookup. A retained category/language filter could also conceal a match, and the input had no visible Search action. The old decoder scanned only canonical spellings, missing whole phrases and spelling variants.

The new build keeps the design, supplies a larger local corpus, adds a visible Search button/keyboard Search action, and makes that action search all sections. Phrase variants of “what is your 20” resolve to the location entry. Bare quantities are not silently treated as secret messages.

## Public comparator review

| Product/source | Publicly advertised functionality | Decision for GenZ Code |
|---|---|---|
| Slang.net / Slang Dictionary | Thousands of terms, offline access, search, favorites, examples, daily slang, random discovery | Add breadth, explicit search, daily discovery and surprise browsing while retaining offline use |
| GenZ Lingo (Google Play) | Slang explanations, examples, daily word, audio, quizzes | Expand explanations and variable quizzes; do not claim pronunciation/audio that is not implemented |
| GenZ Slang Translator & Quiz (App Store) | Dictionary, phrase decoding, games and quizzes | Improve phrase matching and add fresh reference rounds; do not advertise an AI translator or crossword game that is not shipped |
| Dictionary.com / Slang.net “20” references | “What’s your 20?” asks someone’s location; older radio-code roots | Add 20, 10-20 and whole-message aliases with contextual limits; avoid calling it newly invented Gen Z slang |

Public references:

- https://slang.net/help/android_app
- https://slang.net/help/ios_app
- https://play.google.com/store/apps/details?id=com.sharpened.slangit
- https://play.google.com/store/apps/details?id=com.sunvevaidigitaltech.genzlingo
- https://apps.apple.com/us/app/genz-slang-translator-quiz/id6745381864
- https://www.dictionary.com/culture/slang/whats-your-20
- https://slang.net/meaning/20
- https://www.dictionary.com/culture/slang/67
- https://slang.net/meaning/555

No live demand, popularity ranking or origin is inferred from mere inclusion in a dataset. No proprietary competitor database is bulk copied.

## Coverage and limits

See `CONTENT_COUNTS.md` for exact final build counts. The total is distinct normalized expressions, not the sum of overlapping category counts. Aliases are searchable but are not counted as separate new entries; Unicode skin-tone modifiers are excluded from count inflation.

Seven broad collections exceed 500 entries. The numeric collection remains below 500: unsupported numeric meanings were not generated to hit a quota. Regional coverage is primarily regional English plus a small original Roman Urdu/Urdu set, not 500 verified Urdu expressions. Campus and workplace collections include domain terminology beyond slang. Many community-reference expressions are older or niche; none is automatically labeled current, trending or universally understood.

Imported references have been structurally filtered, not individually editorially verified. A small source-checked core is distinguished from authored drafts, community imports and standard Unicode names. Sensitive explicit lookup entries are explained neutrally and excluded from general random discovery/game pools where flagged. Automated filtering cannot replace moderation review.

## Functional additions

- Literal matching trie with longest-phrase preference and punctuation/apostrophe handling.
- Search by expression, alias, full expansion, definition and emoji keywords; question-style queries supported.
- Exact known numeric queries show the exact entry instead of flooding results with years and incidental numbers in definitions.
- Visible all-section Search resets category/language/saved filters; useful guidance when filters hide results.
- Virtualized dictionary rows; the app no longer mounts thousands of cards in a ScrollView.
- Daily code and daily five-question round selected locally by date; no notification/automation or server job.
- Shuffled reference practice for chat, numbers, gaming and emoji names. Emoji rounds test names, not a claim to read sender emotion.
- Source, retrieval date, license, review status and other recorded senses visible in details.
- JSON content plus a separate SQLite/FTS5 export for developer use. The shipped app uses its bundled JSON/index; no network/database credentials are needed.

## Next content-quality work

Before public launch: review high-frequency senses, verify regional translations, resolve community-reference disagreements, add more authored context examples and reply practice, remove stale/niche material where unhelpful, and run independent coverage evaluations on real consented/de-identified chat examples. The app is much broader; it is not an exhaustive or fully verified dictionary of every community’s language.
