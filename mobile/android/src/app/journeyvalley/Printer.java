package app.journeyvalley;

import android.app.Activity;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * Hands the current page to Android's print service, which is also how the
 * phone makes a PDF. That is what the travel book is for: something to keep,
 * or to hand to whoever is not carrying the phone.
 */
public class Printer {

  private final Activity activity;
  private final WebView web;

  Printer(Activity activity, WebView web) {
    this.activity = activity;
    this.web = web;
  }

  @JavascriptInterface
  public void page(final String documentName) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return;

    activity.runOnUiThread(
        new Runnable() {
          @Override
          public void run() {
            final PrintManager manager =
                (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
            if (manager == null) return;

            final String name =
                documentName == null || documentName.length() == 0 ? "Journey Valley" : documentName;

            manager.print(
                name,
                web.createPrintDocumentAdapter(name),
                new PrintAttributes.Builder().build());
          }
        });
  }
}
