import { NextResponse } from "next/server";
import { file } from "@/lib/mobile-api";
import { bearer, json, preflight } from "../../auth";

/**
 * Un dossier. L'appartenance est vérifiée par la requête elle-même — un
 * identifiant deviné ne rend rien — et la charge utile dépend du rôle.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = bearer(request);
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const detail = file(user, Number(id));
  if (!detail) return json({ error: "Dossier introuvable." }, 404);

  return json(detail);
}

export async function OPTIONS(): Promise<NextResponse> {
  return preflight();
}
