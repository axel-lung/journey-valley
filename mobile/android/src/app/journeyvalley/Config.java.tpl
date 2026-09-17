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

  /** En clair uniquement pour une adresse locale, le temps d'un essai. */
  public static boolean allowsPlainHttp() {
    final String host = serverHost();
    return host != null && (host.equals("localhost") || host.equals("127.0.0.1"));
  }
}
