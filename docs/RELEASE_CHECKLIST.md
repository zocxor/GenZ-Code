# GenZ Code — production release gates

1. Editorially review all seed meanings, translations, examples and response suggestions. Add source references, confidence, regional reviewer, and real review timestamps. Check Unicode official emoji names independently.
2. Confirm product identity/package ownership and commission launcher/adaptive icons, splash and store assets. Conduct brand/trademark clearance.
3. Move to a currently supported Expo SDK, checking all dependency and store-policy requirements. Generate native Android, run on low/mid-range physical devices, and test edge-to-edge/safe areas.
4. Test TalkBack, large text, contrast, 48dp targets, Urdu bidirectional rendering, hardware back, long messages, keyboards and screen rotation policy.
5. Add screenshot/component/end-to-end tests for saves after restart, decoder clearing, navigation restoration, deletions, wrong answers and persistence failure.
6. Do not connect AI before server authentication, grounding, schema validation, cost limits, redacted logs, retention policy and adversarial evaluations work.
7. Deploy and security-test backend/CMS before claiming cloud accounts, editorial publishing or account export/deletion.
8. Test offline cold start and saved content. Measure startup/search p95/crash-free sessions on actual devices. Do not advertise unmeasured targets as results.
9. Verify Android manifest permissions, backups, crash logs, release secrets, dependency vulnerabilities and OWASP MASVS controls.
10. Add reviewed privacy policy, terms, support contact and data safety declarations reflecting actual runtime behavior. No advertising at launch.
11. Sign an internal APK, test installation/update/data migration, then prepare a release AAB and staged rollout with monitoring and rollback.

Subscriptions, trends, community features, more curriculum, contextual mastery and the SEO companion are follow-on work, not launch-ready features in this source.
