package app.journeyvalley;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebSettings;

/**
 * The whole app is the web bundle in assets/; this class is the shell that
 * hosts it. It adds what a plain WebView does not give us: durable storage in
 * the app's private directory (localStorage on a file:// origin is not
 * something to trust a trip's data to), the system share sheet, and an Android
 * back button that steps back inside the app before closing it.
 */
public class MainActivity extends Activity {

  private WebView web;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);

    web = new WebView(this);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    // Nothing is fetched over the network, so there is nothing to cache.
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

    web.addJavascriptInterface(new Store(this), "JVStore");
    web.addJavascriptInterface(new Share(this), "JVShare");
    web.loadUrl("file:///android_asset/index.html");
    setContentView(web);
  }

  @Override
  public void onBackPressed() {
    if (web == null) {
      super.onBackPressed();
      return;
    }
    web.evaluateJavascript(
        "(window.JVBack ? String(window.JVBack()) : 'false')",
        new ValueCallback<String>() {
          @Override
          public void onReceiveValue(String handled) {
            // evaluateJavascript hands back a JSON string, quotes included.
            if (!"\"true\"".equals(handled)) {
              finish();
            }
          }
        });
  }
}
