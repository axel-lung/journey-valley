# Journey Valley for Android

The agency in a pocket. One app, two jobs: an advisor signs in and gets their
portfolio, their margins and their quotes; a traveller signs in and gets their
programme, their documents and their travel book. The server decides which,
and the traveller's device is never sent a purchase cost — it is not hidden in
the interface, it never leaves the server.

Everything loaded once reads again with no network, dated, because a travel
book has to open on a plane.

## Install it

1. Copy `dist/journey-valley.apk` to the phone (or download it there).
2. Open it. Android will ask to allow installs from whatever app you opened it
   with — this APK is signed with a self-signed key, not a Play Store one, so
   that prompt is expected.
3. Sign in with the same account as the website.

Android 5.0 (API 21) and up.

## Build it

```bash
JV_SERVER_URL=https://votre-agence.example npm run apk   # → mobile/dist/journey-valley.apk
npm run apk:web    # just the web bundle, to open in a desktop browser
npm run apk:test   # boots the server and drives the bundle in a phone-sized Chromium
```

**`JV_SERVER_URL` is the agency's own server**, and it is fixed at build time.
It goes into two places: the bundle, so the app knows whom to call, and
`Config.java`, so the network bridge will only open a socket to that host.
Each agency therefore installs an APK that can reach its own server and
nothing else — which is what makes the allowlist worth having.

Build dependencies, on Debian or Ubuntu:

```bash
sudo apt-get install aapt apksigner dalvik-exchange zipalign android-sdk-platform-23
```

No Gradle, no Android Studio, and nothing fetched from Google: the build uses
the Android tools the distribution packages, so it runs in a plain container.
`ANDROID_JAR` overrides the platform jar if yours lives elsewhere.

The first build creates `mobile/debug.keystore` and signs with it (v1+v2+v3,
which Android 11+ requires). That key is git-ignored and is a development key —
a release would sign with one you keep safe, and every update must be signed
with the same one or Android refuses to install it over the top.

## What is in it

```
mobile/
  web/        the app: client.ts (API + offline cache), net.ts (transport),
              api.ts (the free services), store.ts (session), app.tsx (screens)
  android/    the WebView shell: manifest, icon, five Java classes
  build.mjs   bundle → Config.java → aapt → javac → dex → zipalign → apksigner
  smoke.mjs   boots a real server and drives the bundle against it
```

The app reads three endpoints — `POST /api/mobile/login`, `GET /api/mobile/home`,
`GET /api/mobile/file/[id]` — and the payload of each depends on the role. The
split lives in `src/lib/mobile-api.ts`, in one file, so there is a single place
to read before asking "what leaves the server?".

Authentication reuses the website's `sessions` table: the phone's token *is* a
session id, with the same expiry and the same revocation. Signing out deletes
the row and wipes everything cached on the device.

### The network path

The bundle is loaded from `file://`, so a plain `fetch` to another origin would
be refused as cross-origin, and opening the WebView up with
`setAllowUniversalAccessFromFileURLs` would hand every script in the page the
whole internet. Instead `Net.java` takes the URL, checks the host against a
fixed list — the six free services plus the agency's server — and only then
opens a socket. The session token travels in an `Authorization` header rather
than in a URL, because URLs end up in logs.

`MainActivity.java` is the rest of the shell: a WebView with JavaScript and DOM
storage on, the `JVStore`, `JVShare`, `JVNet` and `JVPrint` bridges, and a back
button that steps back inside the app before closing it.

## What it does not do

- **No editing.** The phone reads: it does not create dossiers, quotes or
  bookings. Those belong on a keyboard, and pretending otherwise would make a
  cramped form out of a good screen.
- **No push notifications.** A price alert or an accepted quote does not buzz
  the phone yet; that needs a service and a registration, neither of which is
  built.
- **No offline writes.** What is cached can be read, not changed.
