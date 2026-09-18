/**
 * Le guichet unique du pont Java.
 *
 * La coque Android ne connaît qu'un seul point de retour : `window.__jvNetResolve`.
 * Deux modules ont besoin du pont — `client.ts` pour le serveur de l'agence,
 * `net.ts` pour les services libres — et tant que chacun posait sa propre
 * fonction sur `window`, le second chargé écrasait le premier : ses réponses
 * tombaient dans le vide, et l'écran attendait vingt secondes avant d'annoncer
 * que « le serveur n'a pas répondu à temps ».
 *
 * Le registre vit donc ici, une fois pour toutes. Les deux modules déposent
 * leur attente, la coque rend sa réponse, et l'identifiant suffit à retrouver
 * qui l'attendait. Chacun garde en revanche ses propres erreurs : un service
 * libre injoignable et une session expirée ne se racontent pas pareil.
 */

interface Pending {
  resolve: (body: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  /** L'erreur que l'appelant veut voir quand la coque rend un échec. */
  failure: (status: number, body: string) => Error;
}

const pending = new Map<string, Pending>();
let counter = 0;

if (typeof window !== "undefined") {
  window.__jvNetResolve = (id, ok, status, body) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);

    if (ok) entry.resolve(body);
    else entry.reject(entry.failure(status, body));
  };
}

/** Ce que la coque rend quand la requête a échoué. */
export interface BridgeFailure {
  /** Le code HTTP, ou 0 quand la socket n'a même pas abouti. */
  status: number;
  body: string;
}

export interface BridgeRequest {
  /** Préfixe de l'identifiant, pour lire les journaux sans se tromper de module. */
  prefix: string;
  timeoutMs: number;
  /** L'erreur à lever quand rien ne revient. */
  onTimeout: () => Error;
  /** L'erreur à lever quand la coque rend un échec. */
  onFailure: (failure: BridgeFailure) => Error;
  /** Le départ : c'est l'appelant qui choisit `get`, `getWithToken` ou `post`. */
  send: (requestId: string) => void;
}

/** Envoie par le pont et attend la réponse portant le même identifiant. */
export function bridgeRequest(request: BridgeRequest): Promise<string> {
  const id = `${request.prefix}${(counter += 1)}:${Date.now()}`;

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(request.onTimeout());
    }, request.timeoutMs);

    pending.set(id, {
      resolve,
      reject,
      timer,
      failure: (status, body) => request.onFailure({ status, body }),
    });

    try {
      request.send(id);
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
