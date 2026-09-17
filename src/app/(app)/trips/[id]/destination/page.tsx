import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { countryCodeFromName, OFFICIAL_ADVICE_URL, practicalFor } from "@/lib/practical";
import { getTripSummary } from "@/lib/trips";
import { DossierCard, DossierSkeleton } from "../dossier-card";

export const dynamic = "force-dynamic";

/** Ce qu'il faut savoir sur place — la matière du carnet et du conseil. */
export default async function DestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const { id } = await params;
  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const practical = practicalFor(
    countryCodeFromName(trip.destination_country) ?? trip.destination_country,
  );

  return (
    <div className="space-y-6">
      <Suspense fallback={<DossierSkeleton city={trip.destination_city} />}>
        <DossierCard trip={trip} currency={trip.currency} />
      </Suspense>

      {practical && (
        <Card title="La page pratique, à remettre au voyageur">
          <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
            {[
              ["Urgences", practical.emergency],
              ["Monnaie", practical.currency],
              ["Prises", `${practical.plugs} · ${practical.voltage}`],
              ["On roule à", practical.drive],
              ["Pourboire", practical.tipping],
              ["Entrée", practical.entry],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {label}
                </dt>
                <dd className="mt-0.5 text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-stone-100 px-5 py-3 text-xs leading-relaxed text-stone-500">
            Informations indicatives, disponibles sans réseau. Les conditions d'entrée changent :
            vérifiez sur France Diplomatie ({OFFICIAL_ADVICE_URL}) avant de vendre.
          </p>
        </Card>
      )}
    </div>
  );
}
