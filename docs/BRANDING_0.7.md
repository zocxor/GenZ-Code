# GenZ Code branding update — 0.7.0 source

Built from the ZIP attached in this request, whose package version is 0.5.0. This does not restore the separate 0.6 World-navigation revision or its content additions. The attached dictionary is preserved byte for byte; the regional database expansion is not included in this branding update.

## Assets and usage

- assets/brand/genz-code-logo.png: full transparent logo with the GenZ Code wordmark; welcome screen and marketing use. Use at a comfortable size, not as a tiny launcher icon.
- assets/brand/genz-code-mark.png: transparent compact mark; headers, loading, dialogs and app-icon exports.
- assets/brand/genz-code-avatar.png: anonymous guest profile image; first avatar choice, profile header and account shortcut.
- Five additional profile choices use accessible vector symbols in matching glass gradient circles. Stored avatar indices and profile data remain compatible.
- assets/icon.png: 1024px opaque launcher export; assets/adaptive-icon.png: transparent Android foreground; assets/favicon.png: web favicon.
- Native Android launcher, round launcher, adaptive foreground and splash resources are updated. Existing package identity, Firebase configuration and signing guards are preserved. No permissions or network dependencies are added.

All generated masters have transparency and are copied into the project. Color/style is intentionally concentrated in branding; existing navigation and learning screens retain their layout. Generated logo text is raster art, not an editable vector font.

## Reproduce and validate

python3 scripts/export-brand-assets.py requires Pillow. It only resizes/exports existing masters and updates matching asset configuration. npm ci, npm run typecheck, npm test, npm run export:android validate the source. Android JavaScript export is not an APK build. This update has no newly built APK or physical-device verification.

## Generation prompts

Built-in image generation was used, based on the attached Glossy GenZ Mode logo.

1. Full logo: replace the exact wordmark with GenZ Code; preserve polished purple-magenta-orange 3D chat bubble, pearl inset, central Z, purple Aa magnifier and orange rays; transparent background, no mockup or extra text.
2. Compact mark: a single standalone GenZ Code app symbol; no wordmark; simplify the glossy reference bubble, central Z, scan corners and Aa magnifier for small app-icon use; transparent square composition with clear margin.
3. Guest profile: a single anonymous head-and-shoulders silhouette in glossy purple/magenta glass and pearl, subtle orange highlight and circular purple rim; no letters or human photo; transparent background.

Master PNGs are the authoritative artwork. Do not present these raster assets as hand-authored SVGs.

## Verification result

TypeScript passed; all 26 existing tests passed. Android JavaScript/Hermes export passed with all three brand PNGs in its asset manifest. RGBA transparency and Android resource XML were checked. Existing image-size v2 adapter now handles both buffer inputs and the legacy file-path call used by Metro; its postinstall validation exercises both. No native APK assembly or physical-device interaction test was performed.
