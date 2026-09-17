# Journey Valley for Android

A standalone APK, in French: the trips, budgets, checklists, day-by-day programme, search for
flights, stays and activities, price alerts, the destination file, the printable travel book, the
agency comparison and cost splitting — all on the phone. No account and no Journey Valley server:
what you type stays on the device.

The app declares `INTERNET` and `ACCESS_NETWORK_STATE`, because search, weather, exchange rates and
the destination file have to ask someone. It can only reach six free, key-less services
(Nominatim, Overpass, Open-Meteo and its archive, Frankfurter, Wikipédia FR): the list is compiled
into `Net.java`, and *Réglages → Réseau* switches even that off, leaving the rest of the app
working on what it has already cached.

## Install it

1. Copy `dist/journey-valley.apk` to the phone (or download it there).
2. Open it. Android will ask to allow installs from whatever app you opened it with — this APK is
   signed with a self-signed key, not a Play Store one, so that prompt is expected.
3. Launch **Journey Valley**. It opens on three demo trips; *Réglages → Repartir de zéro* clears
   them.

Android 5.0 (API 21) and up.

## Build it

```bash
npm run apk        # → mobile/dist/journey-valley.apk
npm run apk:web    # just the web bundle, to open in a desktop browser
npm run apk:test   # drives that bundle in a phone-sized Chromium (29 checks)
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
  web/        the app: store.ts (persistence), net.ts (transport), api.ts (services), app.tsx
  android/    the WebView shell: manifest, launcher icon, five Java classes
  build.mjs   bundle → aapt → javac → dex → zipalign → apksigner
  smoke.mjs   browser test of the bundle
```

The arithmetic is not reimplemented. `mobile/web/app.tsx` imports `src/lib/budget.ts`,
`src/lib/stages.ts`, `src/lib/money.ts`, `src/lib/watch.ts` and the API parsers directly — the same
modules the web app uses and `npm test` covers — so the phone and the server can never disagree
about a total, a split, a saving or what a service answered. Only the transport and the storage
differ: the server has SQLite and `fetch` (`src/lib/api/live.ts`), the phone has a JSON document
written by `Store.java` into the app's private directory (through a temp file and a rename, so an
interrupted save cannot corrupt it) and the `JVNet` bridge (`mobile/web/api.ts`).

### The network path

The bundle is loaded from `file://`, so a plain `fetch` to another origin would be refused as
cross-origin, and opening the WebView up with `setAllowUniversalAccessFromFileURLs` would hand
every script in the page the whole internet. Instead `Net.java` takes the URL, checks the host
against its fixed list, and only then opens a socket — on a small thread pool, answering back
through `window.__jvNetResolve`. Adding a service means editing that list and rebuilding.

Answers are cached in the same JSON document as the trips, with the TTL each service asks for, and
a stale answer is served when the network fails: the destination file still reads in the plane.

`MainActivity.java` is the rest of the shell: a WebView with JavaScript and DOM storage on, the
`JVStore`, `JVShare`, `JVNet` and `JVPrint` bridges, and a back button that steps back inside the
app before closing it. `JVShare` hands the settle-up summary to Android's share sheet, so it can go
straight to the group chat; `JVPrint` hands the travel book to Android's print service, which also
writes PDFs.

## How it differs from the web app

This build is one device, one traveller. That means:

- **No accounts and no sign-in.** Nothing to log into; your trips are not sent anywhere.
- **Companions are names you type**, not people with logins. Splitting and settling work exactly
  as they do on the web — the names just are not linked to anyone.
- **No plans.** Free and Plus are a subscription concern; there is nothing to enforce here.
- **Trips are not shared or synced.** Two phones running this build know nothing about each other.
- **Price alerts are checked when you ask.** The web app has a cron endpoint that sweeps them;
  an app cannot poll in the background without a foreground service, so the alert list has a
  *Vérifier* button and remembers what each check found.
- **Flight and stay prices are estimates**, exactly as on the web when no booking provider is
  configured: the same shared estimator, labelled as such on screen. Activities are real places
  from OpenStreetMap, which knows the museum but not its ticket, so the app asks you for the price
  instead of inventing one.

Sharing a trip between real people is what the web app is for. A future version would sync this
local document to an account, which is why the local rows keep the same shape as the server's.
