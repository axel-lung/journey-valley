package app.journeyvalley;

import android.content.Context;
import android.webkit.JavascriptInterface;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * The web bundle's persistence, backed by a single JSON file in the app's
 * private storage. Writes go through a temporary file and a rename, so a
 * crash mid-save cannot leave a half-written trip list behind.
 */
public class Store {

  private static final String FILE_NAME = "journey-valley.json";

  private final Context context;

  Store(Context context) {
    this.context = context;
  }

  @JavascriptInterface
  public String load() {
    File file = new File(context.getFilesDir(), FILE_NAME);
    if (!file.exists()) return "";

    FileInputStream in = null;
    try {
      in = new FileInputStream(file);
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buffer = new byte[8192];
      int read;
      while ((read = in.read(buffer)) != -1) {
        out.write(buffer, 0, read);
      }
      return out.toString("UTF-8");
    } catch (IOException error) {
      // An unreadable file must not wedge the app: the web side treats an
      // empty string as "nothing saved yet" and starts from the demo data.
      return "";
    } finally {
      close(in);
    }
  }

  @JavascriptInterface
  public void save(String json) {
    File target = new File(context.getFilesDir(), FILE_NAME);
    File temporary = new File(context.getFilesDir(), FILE_NAME + ".tmp");

    FileOutputStream out = null;
    try {
      out = new FileOutputStream(temporary);
      out.write(json.getBytes("UTF-8"));
      out.flush();
      out.getFD().sync();
      close(out);
      out = null;

      if (target.exists() && !target.delete()) return;
      if (!temporary.renameTo(target)) temporary.delete();
    } catch (IOException error) {
      temporary.delete();
    } finally {
      close(out);
    }
  }

  private static void close(java.io.Closeable stream) {
    if (stream == null) return;
    try {
      stream.close();
    } catch (IOException ignored) {
      // Nothing useful to do when closing fails.
    }
  }
}
