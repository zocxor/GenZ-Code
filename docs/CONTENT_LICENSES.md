# GenZ Code — content provenance and licenses

The app source, branding and original art are separate from third-party dictionary data. This notice does not relicense the app’s source code or branding.

## Wiktionary-derived definitions

Attribution: Wiktionary contributors; structured extraction by Kaikki.org / Wiktextract (Tatu Ylonen and contributors). Definitions and adapted dictionary examples are used under CC BY-SA 4.0. Each imported entry carries a link back to its Wiktionary page; those pages provide contributor history. Adaptations here include filtering, selection, grouping, shortening display previews, adding category/context labels and creating a normalized database. Wiktionary-derived definition fields retain CC BY-SA 4.0; recipients must preserve attribution and applicable share-alike obligations on adaptations of that content.

- Source: https://kaikki.org/dictionary/English/index.html
- Original entries: https://en.wiktionary.org/
- Copyright policy: https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- License: https://creativecommons.org/licenses/by-sa/4.0/
- Full license text: `licenses/CC-BY-SA-4.0.txt`
- Wiktextract research reference: Tatu Ylonen, “Wiktextract: Wiktionary as Machine-Readable Structured Data,” LREC 2022, pp. 1317–1325.

No third-party book, song, film or article quotations from example fields are copied. The importer selects dictionary glosses and examples explicitly identified as unreferenced dictionary examples. A license notice is not a substitute for a release content review.

## Unicode emoji and symbols

Attribution: Copyright © Unicode, Inc. and contributors. Standard names/search annotations from CLDR are used under Unicode-3.0, with its notice preserved in `licenses/UNICODE_LICENSE.txt`. Adaptations include excluding skin-tone modifiers from count inflation, selecting base symbols and adding clearly separate authored conversational notes. Standard names and keywords do not establish a universal slang meaning.

- https://github.com/unicode-org/cldr/blob/main/common/annotations/en.xml
- https://github.com/unicode-org/cldr/blob/main/common/annotationsDerived/en.xml

## Will Wade’s TXT/SMS abbreviations

Attribution: Will Wade, `willwade/txt-sms-abbreviations`, publisher-declared Apache-2.0. The data is filtered, normalized and merged; some unsuitable or unclear records are excluded, and selected entries are overridden with more contextual original explanations. It is a community reference, not a verified popularity list. Retain the Apache notice and source attribution on redistribution. Upstream provenance should be rechecked before public commercial release.

- https://huggingface.co/datasets/willwade/txt-sms-abbreviations
- License text: `licenses/APACHE-2.0.txt`

## Original explanations and linked references

Original GenZ Code explanations/examples are marked Authored draft unless a particular central interpretation was checked. Links to Dictionary.com, Slang.net, CyberDefinitions and other references support original factual summaries; their proprietary databases, examples, logos, images and app code are not copied wholesale. Linking to a source does not grant its license to the app’s importer.

## Auditability

`src/data/manifest.json` records source hashes, actual collection counts, review-status counts and scope limits. `data/genz_code_dictionary.sqlite` is a portable export of the same normalized records, with provenance in its payloads. Both JSON and SQLite contain data governed by the source-specific licenses above. Source URLs and licenses are visible on entry detail screens.
