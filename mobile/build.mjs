/**
 * Builds the Android APK: bundles the offline web app, then packages it into a
 * WebView shell with the plain Android command-line tools.
 *
 *   npm run apk        → mobile/dist/journey-valley.apk
 *   npm run apk:web    → just the web bundle, for a desktop browser
 *
 * Deliberately no Gradle and no Android Studio: this needs only the tools
 * Debian and Ubuntu package (`aapt`, `dalvik-exchange`, `apksigner`,
 * `zipalign`, `android-sdk-platform-23`) plus a JDK, so it builds in a plain
 * container without downloading an SDK. See mobile/README.md.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = join(root, "mobile");
const dist = join(mobile, "dist");
const www = join(dist, "www");
const work = join(dist, "build");

const webOnly = process.argv.includes("--web-only");

// L'adresse du serveur de l'agence. Elle est figée dans l'APK : côté web pour
// savoir qui appeler, côté Java pour n'autoriser que cet hôte.
const SERVER_URL = (process.env.JV_SERVER_URL ?? "https://demo.journeyvalley.app").replace(/\/$/, "");

const ANDROID_JAR =
  process.env.ANDROID_JAR ?? "/usr/lib/android-sdk/platforms/android-23/android.jar";

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options })
    .toString()
    .trim();
}

function requireTool(name) {
  try {
    run("sh", ["-c", `command -v ${name}`]);
  } catch {
    throw new Error(
      `${name} is missing. On Debian/Ubuntu:\n` +
        "  sudo apt-get install aapt apksigner dalvik-exchange zipalign android-sdk-platform-23",
    );
  }
}

/* ------------------------------------------------------------- web bundle */

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

await esbuild.build({
  entryPoints: [join(mobile, "web", "app.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome80"],
  jsx: "automatic",
  outfile: join(www, "app.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
    __JV_SERVER__: JSON.stringify(SERVER_URL),
  },
  logLevel: "warning",
});

run("npx", ["@tailwindcss/cli", "-i", join(mobile, "web", "styles.css"), "-o", join(www, "app.css"), "--minify"], {
  cwd: root,
});

cpSync(join(mobile, "web", "index.html"), join(www, "index.html"));
console.log(`web bundle → ${www} (serveur : ${SERVER_URL})`);

if (webOnly) process.exit(0);

/* -------------------------------------------------------------------- apk */

// Le fichier de configuration Java, engendré à partir du modèle : c'est lui
// qui fixe l'hôte autorisé dans le pont réseau.
writeFileSync(
  join(mobile, "android", "src", "app", "journeyvalley", "Config.java"),
  readFileSync(join(mobile, "android", "src", "app", "journeyvalley", "Config.java.tpl"), "utf8").replace(
    "__SERVER__",
    SERVER_URL,
  ),
);

// Le manifeste aussi : Android bloque le HTTP en clair depuis la version 9, et
// on ne lève ce blocage que si le serveur configuré est justement en clair —
// un APK visant du HTTPS n'a donc aucune tolérance au clair.
const cleartext = SERVER_URL.startsWith("http://");
if (cleartext) {
  console.log(`⚠ ${SERVER_URL} est en clair : l'APK autorisera le HTTP (essais sur réseau local).`);
}
writeFileSync(
  join(dist, "AndroidManifest.xml"),
  readFileSync(join(mobile, "android", "AndroidManifest.xml.tpl"), "utf8").replace(
    "__CLEARTEXT__",
    cleartext ? 'android:usesCleartextTraffic="true"' : "",
  ),
);

for (const tool of ["aapt", "apksigner", "dalvik-exchange", "zipalign", "javac", "keytool"]) {
  requireTool(tool);
}
if (!existsSync(ANDROID_JAR)) {
  throw new Error(
    `No android.jar at ${ANDROID_JAR}. Install android-sdk-platform-23, or set ANDROID_JAR.`,
  );
}

rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "classes"), { recursive: true });
mkdirSync(join(work, "gen"), { recursive: true });

const android = join(mobile, "android");
const unsigned = join(work, "unsigned.apk");
const aligned = join(work, "aligned.apk");
const keystore = join(mobile, "debug.keystore");
const output = join(dist, "journey-valley.apk");

// 1. Resources, manifest and the web bundle as assets.
run("aapt", [
  "package", "-f",
  "-M", join(dist, "AndroidManifest.xml"),
  "-S", join(android, "res"),
  "-A", www,
  "-I", ANDROID_JAR,
  "-F", unsigned,
  "-J", join(work, "gen"),
]);

// 2. Java → classes → dex. `dalvik-exchange` reads Java 8 bytecode.
const sources = run("sh", [
  "-c",
  `find ${JSON.stringify(join(android, "src"))} ${JSON.stringify(join(work, "gen"))} -name '*.java'`,
])
  .split("\n")
  .filter(Boolean);

run("javac", [
  "-nowarn",
  "-source", "8",
  "-target", "8",
  "-bootclasspath", ANDROID_JAR,
  "-cp", ANDROID_JAR,
  "-d", join(work, "classes"),
  ...sources,
]);

run("dalvik-exchange", ["--dex", `--output=${join(work, "classes.dex")}`, join(work, "classes")]);

// `aapt add` stores the entry under the path it is given, so run it from the
// directory holding classes.dex to keep the entry at the archive root.
run("aapt", ["add", unsigned, "classes.dex"], { cwd: work });

// 3. Align, then sign — in that order, because signing must come last.
run("zipalign", ["-f", "4", unsigned, aligned]);

if (!existsSync(keystore)) {
  run("keytool", [
    "-genkeypair", "-keystore", keystore,
    "-storepass", "android", "-keypass", "android",
    "-alias", "journey-valley", "-keyalg", "RSA", "-keysize", "2048",
    "-validity", "10000", "-dname", "CN=Journey Valley, OU=Demo, O=Journey Valley",
  ]);
  console.log(`created a self-signed debug key → ${keystore}`);
}

run("apksigner", [
  "sign",
  "--ks", keystore,
  "--ks-pass", "pass:android",
  "--key-pass", "pass:android",
  "--out", output,
  aligned,
]);

const certificate = run("apksigner", ["verify", "--print-certs", output]);
writeFileSync(join(dist, "signature.txt"), `${certificate}\n`);

const size = run("sh", ["-c", `du -h ${JSON.stringify(output)} | cut -f1`]);
console.log(`\nAPK → ${output} (${size})`);
console.log(certificate.split("\n").find((line) => line.includes("SHA-256")) ?? "");
