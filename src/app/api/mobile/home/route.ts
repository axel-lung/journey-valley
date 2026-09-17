import { NextResponse } from "next/server";
import { home } from "@/lib/mobile-api";
import { bearer, json, preflight } from "../auth";

/** Le portefeuille du conseiller, ou les voyages du client. */
export async function GET(request: Request): Promise<NextResponse> {
  const user = bearer(request);
  if (user instanceof NextResponse) return user;
  return json(home(user));
}

export async function OPTIONS(): Promise<NextResponse> {
  return preflight();
}
