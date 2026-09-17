import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { coverStyle } from "@/lib/cover";
import { countdown, formatDateRange, formatNights } from "@/lib/format";
import { tripNights } from "@/lib/budget";
import { listTrips } from "@/lib/trips";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";

export const dynamic = "force-dynamic";

/**
 * L'espace voyageur : les dossiers dont le client est membre.
 *
 * Aucun chiffre d'achat ne transite par cette branche de l'application — ni ici
 * ni dans la page d'un voyage. C'est la garantie qui tient la promesse faite au
 * conseiller : son client ne verra jamais ses coûts.
 */
export default async function MyTripsPage() {
  const user = await requireUser();
  if (isAdvisor(user)) redirect("/trips");

  const trips = listTrips({ userId: user.id });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Vos voyages</h1>
        <p className="mt-1 text-sm text-stone-500">
          Préparés avec votre conseiller. Tout est là : le programme, les documents et le carnet.
        </p>
      </header>

      {trips.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucun voyage pour l'instant"
            hint="Dès que votre conseiller vous ouvre un dossier, il apparaît ici."
          />
        </Card>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {trips.map((trip) => {
            const when = countdown(trip.start_date, trip.end_date);
            return (
              <li key={trip.id}>
                <Link
                  href={`/mon-voyage/${trip.id}`}
                  className="block overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div
                    className="flex h-28 items-end px-5 pb-3"
                    style={coverStyle(`${trip.destination_city}${trip.destination_country}`)}
                  >
                    <div className="text-white">
                      <p className="text-lg font-semibold leading-tight">{trip.title}</p>
                      <p className="text-sm text-white/85">
                        {trip.destination_city}, {trip.destination_country}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 px-5 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
                      {when.upcoming && trip.stage !== "cancelled" && (
                        <span className="text-sm font-medium text-brand-700">{when.label}</span>
                      )}
                    </div>
                    <p className="text-sm text-stone-500">
                      {formatDateRange(trip.start_date, trip.end_date)} ·{" "}
                      {formatNights(tripNights(trip))}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
