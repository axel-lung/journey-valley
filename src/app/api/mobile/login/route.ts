import { NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/mobile-api";
import { json, preflight } from "../auth";

/**
 * L'entrée de l'application mobile.
 *
 * Le jeton rendu est un identifiant de session : même table, même expiration,
 * même révocation que le site. Se déconnecter du téléphone supprime la ligne,
 * et rien d'autre n'est à invalider.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const parsed = z
    .object({ email: z.string().trim().min(3), password: z.string().min(1) })
    .safeParse(body);

  if (!parsed.success) {
    return json({ error: "Indiquez votre e-mail et votre mot de passe." }, 400);
  }

  const session = signIn(parsed.data.email, parsed.data.password);
  if (!session) {
    // Même message dans les deux cas : l'API ne dit pas quelles adresses existent.
    return json({ error: "E-mail ou mot de passe incorrect." }, 401);
  }

  return json(session);
}

export async function OPTIONS(): Promise<NextResponse> {
  return preflight();
}
