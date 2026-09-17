import { NextResponse } from "next/server";
import { userForToken } from "@/lib/mobile-api";
import type { User } from "@/lib/types";

/**
 * L'API du téléphone.
 *
 * Elle n'utilise pas de cookie : l'unique justificatif est le jeton porté par
 * l'en-tête Authorization. C'est ce qui permet de l'ouvrir à toutes les
 * origines sans risque de CSRF — un site tiers peut bien émettre la requête,
 * le navigateur n'y attachera aucune identité. La coque Android, elle, passe
 * par le pont Java et ne voit même pas ces en-têtes.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-max-age": "86400",
};

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS });
}

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Le porteur du jeton, ou la réponse 401 à renvoyer tel quel. */
export function bearer(request: Request): User | NextResponse {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = token ? userForToken(token) : null;

  if (!user) return json({ error: "Session expirée. Reconnectez-vous." }, 401);
  return user;
}
