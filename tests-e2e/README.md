# Browser end-to-end checks

Run against exported web builds (AsyncStorage → localStorage on web):

```
mkdir -p tests-e2e/shots && npx expo export --platform web --clear --output-dir build/web && python3 -m http.server 8090 --directory build/web &
node tests-e2e/persistence.mjs   # close/reopen persistence, corruption recovery, quarantine, deletion (18 checks)
node tests-e2e/photo.mjs         # profile photo pick → crop/downscale → persist → delete (8 checks)

# Account flows need the Firebase Auth emulator and an emulator-wired build:
firebase emulators:start --only auth --project gen-z-code-55caf &
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo export --platform web --clear --output-dir build/web-emu
python3 -m http.server 8091 --directory build/web-emu &
node tests-e2e/auth.mjs          # sign-up, throttling, sign-out, safe deletion (15 checks)

# Admin portal with production headers (after `cd admin && npm run build`):
node tests-e2e/hosting-server.mjs admin/dist 8092 firebase.json &
node tests-e2e/admin.mjs         # CSP, public pages, fail-closed gate (10 checks; gate part needs an emulator build on :8093)
```
Always rebuild release bundles with `--clear` and without `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`.
