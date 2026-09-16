# Journey Valley for Android

A standalone APK: the trips, budgets, agency comparison and cost splitting from the web app,
running entirely on the phone. No account, no server, no network permission — the app ships with
no `<uses-permission>` at all.

## Install it

1. Copy `dist/journey-valley.apk` to the phone (or download it there).
2. Open it. Android will ask to allow installs from whatever app you opened it with — this APK is
   signed with a self-signed key, not a Play Store one, so that prompt is expected.
3. Launch **Journey Valley**. It opens on three demo trips; *Settings → Start from empty* clears
   them.

Android 5.0 (API 21) and up.

## Build it

```bash
npm run apk        # → mobile/dist/journey-valley.apk
npm run apk:web    # just the web bundle, to open in a desktop browser
npm run apk:test   # drives that bundle in a phone-sized Chromium (12 checks)
```

Build dependencies, on Debian or Ubuntu:

```bash
sudo apt-get install aapt apksigner dalvik-exchange zipalign android-sdk-platform-23
```

There is no Gradle and no Android Studio here, and nothing is fetched from Google: the build uses
the Android tools packaged by the distribution, so it runs in a plain container. `ANDROID_JAR`
overrides the platform jar if yours lives elsewhere.

The first build creates `mobile/debug.keystore` and signs with it (v1+v2+v3, which Android 11+
requires). That key is git-ignored and is a development key — a release would sign with a key you
keep somewhere safe, and every update must be signed with the same one or Android refuses to
install it over the top.

## What is in it

```
mobile/
  web/        the offline app: store.ts (persistence) + app.tsx (screens)
  android/    the WebView shell: manifest, launcher icon, two Java classes
  build.mjs   bundle → aapt → javac → dex → zipalign → apksigner
  smoke.mjs   browser test of the bundle
```

The arithmetic is not reimplemented. `mobile/web/app.tsx` imports `src/lib/budget.ts`,
`src/lib/stages.ts` and `src/lib/money.ts` directly — the same modules the web app uses and
`npm test` covers — so the phone and the server can never disagree about a total, a split or a
saving. Only storage differs: the server has SQLite, the phone has a JSON document written by
`Store.java` into the app's private directory (through a temp file and a rename, so an interrupted
save cannot corrupt it).

`MainActivity.java` is the rest of the shell: a WebView with JavaScript and DOM storage on, the
`JVStore` bridge, and a back button that steps back inside the app before closing it.

## How it differs from the web app

This build is one device, one traveller. That means:

- **No accounts and no sign-in.** Nothing to log into, nothing sent anywhere.
- **Companions are names you type**, not people with logins. Splitting and settling work exactly
  as they do on the web — the names just are not linked to anyone.
- **No plans.** Free and Plus are a subscription concern; there is nothing to enforce offline.
- **Trips are not shared or synced.** Two phones running this build know nothing about each other.

Sharing a trip between real people is what the web app is for. A future version would sync this
local document to an account, which is why the local rows keep the same shape as the server's.
