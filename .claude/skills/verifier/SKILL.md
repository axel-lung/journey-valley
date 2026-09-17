---
name: verifier
description: Run every check on Journey Valley — typecheck, unit tests, the web end-to-end suite and the Android bundle suite — and report what broke. Use before committing, after any change to margin/VAT/quote logic, or when asked to "vérifier", "tout tester", "run the checks".
---

# Vérifier Journey Valley

Quatre suites, dans cet ordre. Chacune doit passer ; ne jamais annoncer « vert »
sans avoir vu le compte final.

```bash
npm run typecheck
npm test                                     # attendu : 162 tests
npm run build
npm run smoke                                # attendu : 57/57
JV_SERVER_URL=http://127.0.0.1:3114 npm run apk:web
npm run apk:test                             # attendu : 19/19
```

Notes qui évitent de perdre du temps :

- `npm run smoke` et `npm run apk:test` démarrent un vrai serveur Next sur une
  base jetable et le tuent en sortant. Si un port reste occupé (3111 pour le
  web, 3114 pour le mobile), c'est un serveur orphelin d'un essai interrompu :
  `pkill -f "next start"`.
- `apk:test` refuse de tourner si le bundle vise un autre serveur que
  `http://127.0.0.1:3114` — d'où la reconstruction juste avant. Le message
  d'erreur le dit.
- `npm run build` est nécessaire avant `smoke` : celui-ci lance la version de
  production, pas le serveur de développement.
- Les suites tournent avec `JV_DISABLE_LIVE_APIS=1`. Un test qui exigerait un
  appel réseau réel est un test à réécrire, pas un environnement à réparer.

Quand quelque chose casse, rapporter la sortie réelle — le nom de la
vérification et son message — jamais un résumé rassurant.
