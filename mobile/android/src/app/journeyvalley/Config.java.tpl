package app.journeyvalley;

import java.net.URI;

/**
 * L'adresse du serveur de l'agence, fixée à la construction de l'APK.
 *
 * Ce fichier est engendré par mobile/build.mjs à partir de JV_SERVER_URL :
 * chaque agence installe donc un APK qui ne sait joindre que son propre
 * serveur, ce qui rend la liste blanche de Net.java vérifiable.
 */
public final class Config {

  public static final String SERVER = "__SERVER__";

  private Config() {}

  public static String serverHost() {
    try {
      final String host = URI.create(SERVER).getHost();
      return host == null || host.length() == 0 ? null : host;
    } catch (Exception error) {
      return null;
    }
  }

  /**
   * Le clair n'est toléré que sur un réseau privé : la machine elle-même, ou
   * une adresse RFC 1918 — le temps d'essayer l'application contre un poste de
   * développement. Un serveur public doit être en HTTPS, et l'est.
   */
  public static boolean allowsPlainHttp() {
    final String host = serverHost();
    if (host == null) return false;
    if (host.equals("localhost") || host.equals("127.0.0.1") || host.equals("10.0.2.2")) return true;
    if (host.startsWith("192.168.") || host.startsWith("10.")) return true;

    // 172.16.0.0 – 172.31.255.255
    if (host.startsWith("172.")) {
      final String[] parts = host.split("\\.");
      if (parts.length == 4) {
        try {
          final int second = Integer.parseInt(parts[1]);
          return second >= 16 && second <= 31;
        } catch (NumberFormatException error) {
          return false;
        }
      }
    }
    return false;
  }
}
