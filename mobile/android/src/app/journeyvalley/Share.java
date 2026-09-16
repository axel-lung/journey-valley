package app.journeyvalley;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;

/**
 * Hands a settle-up summary to Android's share sheet, so it can go straight to
 * the group chat where these conversations actually happen.
 */
public class Share {

  private final Activity activity;

  Share(Activity activity) {
    this.activity = activity;
  }

  @JavascriptInterface
  public void text(String body) {
    if (body == null || body.length() == 0) return;

    final Intent intent = new Intent(Intent.ACTION_SEND);
    intent.setType("text/plain");
    intent.putExtra(Intent.EXTRA_TEXT, body);

    // A JavascriptInterface call arrives on the WebView's own thread; starting
    // an activity has to happen on the UI thread.
    activity.runOnUiThread(
        new Runnable() {
          @Override
          public void run() {
            activity.startActivity(Intent.createChooser(intent, "Partager le récap"));
          }
        });
  }
}
