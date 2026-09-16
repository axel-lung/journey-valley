import { NextResponse } from "next/server";
import { checkAllWatches } from "@/lib/watch-runner";

/**
 * The automation entry point: re-checks every price watch.
 *
 * Meant to be called by whatever scheduler you already have — cron, a systemd
 * timer, a GitHub Action, your host's scheduled jobs:
 *
 *   0 7 * * *  curl -fsS -X POST https://your-host/api/watches/check \
 *                  -H "x-cron-key: $WATCH_CRON_SECRET"
 *
 * It refuses to run until WATCH_CRON_SECRET is set, so an unconfigured
 * deployment cannot expose an endpoint that hammers a paid API.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.WATCH_CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "WATCH_CRON_SECRET n'est pas configuré : la vérification planifiée est désactivée." },
      { status: 503 },
    );
  }
  if (request.headers.get("x-cron-key") !== secret) {
    return NextResponse.json({ error: "Clé de planification invalide." }, { status: 401 });
  }

  const summary = await checkAllWatches();
  return NextResponse.json({ ok: true, ...summary });
}
