package app.journeyvalley;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * The app's only way out to the network.
 *
 * The web bundle is loaded from file://, so a plain fetch would be blocked as
 * cross-origin — and opening the WebView up with
 * setAllowUniversalAccessFromFileURLs would hand every script in the page the
 * whole internet. Instead the request is handed to Java, which checks the host
 * against a fixed list before it opens a socket. The app can reach these six
 * free services and nothing else: no telemetry, no analytics, no surprises.
 *
 * Requests run on a small pool and answer through `window.__jvNetResolve`, so
 * the interface never waits on a socket.
 */
public class Net {

  /** The only hosts this app may contact. Adding one is a deliberate act. */
  private static final Set<String> ALLOWED = new HashSet<>(
      Arrays.asList(
          "nominatim.openstreetmap.org",
          "overpass-api.de",
          "api.open-meteo.com",
          "archive-api.open-meteo.com",
          "api.frankfurter.app",
          "fr.wikipedia.org"));

  private static final String USER_AGENT =
      "JourneyValley-Android/0.1 (https://github.com/axel-lung/journey-valley)";

  private static final int CONNECT_TIMEOUT_MS = 10_000;
  private static final int READ_TIMEOUT_MS = 25_000;
  /** A free API answering with megabytes means something has gone wrong. */
  private static final int MAX_BYTES = 2_000_000;

  private final WebView web;
  private final ExecutorService pool = Executors.newFixedThreadPool(3);

  Net(WebView web) {
    this.web = web;
  }

  @JavascriptInterface
  public void get(final String url, final String requestId) {
    pool.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              final URL parsed = new URL(url);
              if (!"https".equals(parsed.getProtocol()) || !ALLOWED.contains(parsed.getHost())) {
                resolve(requestId, false, 0, "Hôte non autorisé : " + parsed.getHost());
                return;
              }
              request(parsed, requestId);
            } catch (Exception error) {
              resolve(requestId, false, 0, "Requête impossible.");
            }
          }
        });
  }

  private void request(URL url, String requestId) {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) url.openConnection();
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setRequestProperty("User-Agent", USER_AGENT);
      connection.setRequestProperty("Accept", "application/json");

      final int status = connection.getResponseCode();
      final InputStream stream =
          status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      final String body = stream == null ? "" : read(stream);

      resolve(requestId, status >= 200 && status < 300, status, body);
    } catch (Exception error) {
      resolve(requestId, false, 0, "Service injoignable.");
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private String read(InputStream stream) throws Exception {
    final ByteArrayOutputStream out = new ByteArrayOutputStream();
    final byte[] buffer = new byte[8192];
    int total = 0;
    int count;

    while ((count = stream.read(buffer)) != -1) {
      total += count;
      if (total > MAX_BYTES) throw new Exception("Réponse trop volumineuse.");
      out.write(buffer, 0, count);
    }
    return out.toString("UTF-8");
  }

  /** Hands the answer back to the page, on the thread the WebView expects. */
  private void resolve(final String requestId, final boolean ok, final int status, final String body) {
    final String script =
        "window.__jvNetResolve && window.__jvNetResolve("
            + JSONObject.quote(requestId)
            + ","
            + ok
            + ","
            + status
            + ","
            + JSONObject.quote(body)
            + ")";

    web.post(
        new Runnable() {
          @Override
          public void run() {
            web.evaluateJavascript(script, null);
          }
        });
  }
}
