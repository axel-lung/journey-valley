/**
 * Le pont Java, déclaré une seule fois.
 *
 * `net.ts` et `client.ts` passent tous les deux par `window.JVNet`, mais une
 * interface `Window` augmentée deux fois doit l'être à l'identique — sinon
 * TypeScript refuse la fusion (TS2717). Le contrat vit donc ici, et les deux
 * modules le lisent.
 *
 * Tout est optionnel : dans un navigateur de bureau le pont est absent et les
 * modules retombent sur `fetch`.
 */

interface JVNetBridge {
  get(url: string, requestId: string): void;
  post?(url: string, body: string, token: string, requestId: string): void;
  getWithToken?(url: string, token: string, requestId: string): void;
}

interface Window {
  JVNet?: JVNetBridge;
  JVPrint?: { page(documentName: string): void };
  __jvNetResolve?: (id: string, ok: boolean, status: number, body: string) => void;
}
