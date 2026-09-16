import { Badge, Card } from "@/components/ui";
import { buildDossier } from "@/lib/dossier";
import { formatDateShort } from "@/lib/format";
import { formatMoney, type Currency } from "@/lib/money";
import { OFFICIAL_ADVICE_URL } from "@/lib/practical";
import type { Trip } from "@/lib/types";

/**
 * The destination file: weather, money, what there is to see, and the practical
 * page. Rendered inside a Suspense boundary because it waits on several free
 * services, none of which should hold up the rest of the trip page.
 */
export async function DossierCard({
  trip,
  currency,
}: {
  trip: Trip;
  currency: Currency;
}) {
  const dossier = await buildDossier(trip, currency);

  const hasAnything =
    dossier.weather || dossier.guide || dossier.pois.length > 0 || dossier.exchange || dossier.practical;

  return (
    <Card
      title={`${trip.destination_city}, en pratique`}
      action={
        dossier.missing.length > 0 ? (
          <span className="text-xs text-stone-400">
            {dossier.missing.length} section{dossier.missing.length > 1 ? "s" : ""} indisponible
            {dossier.missing.length > 1 ? "s" : ""}
          </span>
        ) : null
      }
    >
      {!hasAnything ? (
        <p className="px-5 py-5 text-sm text-stone-500">
          Aucune information n'a pu être récupérée pour cette destination. Les services utilisés
          sont gratuits et peuvent être momentanément injoignables — la page se remplira d'elle-même
          au prochain chargement.
        </p>
      ) : (
        <div className="divide-y divide-stone-100">
          {dossier.guide && (
            <section className="px-5 py-4">
              <p className="text-sm leading-relaxed text-stone-700">{dossier.guide.extract}</p>
              <p className="mt-2 text-xs text-stone-400">
                {dossier.guide.attribution}
                {dossier.guide.url && (
                  <>
                    {" · "}
                    <a
                      href={dossier.guide.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      lire la suite
                    </a>
                  </>
                )}
              </p>
            </section>
          )}

          {dossier.weather && dossier.weather.days.length > 0 && (
            <section className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-stone-900">
                  {dossier.weather.kind === "forecast"
                    ? "Météo prévue"
                    : "Ce qu'il fait à cette saison"}
                </h3>
                <span className="text-xs text-stone-400">
                  {dossier.weather.source}
                  {dossier.weather.kind === "normals" ? " · d'après l'an dernier" : ""}
                </span>
              </div>

              <p className="mt-1 text-sm text-stone-600">
                {dossier.weather.average_min_c}° à {dossier.weather.average_max_c}° en moyenne ·{" "}
                {dossier.weather.rainy_days === 0
                  ? "aucun jour de pluie"
                  : `${dossier.weather.rainy_days} jour${dossier.weather.rainy_days > 1 ? "s" : ""} de pluie`}{" "}
                sur {dossier.weather.days.length}
              </p>

              <ul className="mt-3 flex flex-wrap gap-2">
                {dossier.weather.days.slice(0, 8).map((day) => (
                  <li
                    key={day.date}
                    className="rounded-xl bg-stone-50 px-3 py-2 text-center text-xs text-stone-600"
                  >
                    <p className="font-medium text-stone-800">{formatDateShort(day.date)}</p>
                    <p className="mt-0.5 tabular-nums">
                      {day.min_c}° / {day.max_c}°
                    </p>
                    {day.rain_mm >= 1 && <p className="text-brand-600">{day.rain_mm} mm</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dossier.exchange && (
            <section className="px-5 py-4">
              <h3 className="text-sm font-semibold text-stone-900">Argent sur place</h3>
              <p className="mt-1 text-sm text-stone-600">
                1 {currency} ≈ {dossier.exchange.rate.toFixed(2)} {dossier.exchange.local_currency} ·{" "}
                {formatMoney(1_000, currency)} font{" "}
                {(dossier.exchange.example_local_cents / 100).toFixed(0)}{" "}
                {dossier.exchange.local_currency}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                Taux BCE du {dossier.exchange.date || "jour"} · les bureaux de change prennent une
                marge en plus.
              </p>
            </section>
          )}

          {dossier.pois.length > 0 && (
            <section className="px-5 py-4">
              <h3 className="text-sm font-semibold text-stone-900">À voir sur place</h3>
              <ul className="mt-2 space-y-2">
                {dossier.pois.map((poi) => (
                  <li key={poi.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-stone-700">
                      {poi.name}
                      <span className="ml-2 text-xs text-stone-400">{poi.label}</span>
                    </span>
                    <a
                      href={poi.website ?? poi.osm_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-brand-600 hover:underline"
                    >
                      voir
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-400">
                Lieux issus d'OpenStreetMap (ODbL). Les tarifs ne figurent pas dans la carte : à
                compléter quand vous réservez.
              </p>
            </section>
          )}

          {dossier.practical && (
            <section className="px-5 py-4">
              <h3 className="text-sm font-semibold text-stone-900">Bon à savoir</h3>
              <dl className="mt-2 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {[
                  ["Urgences", dossier.practical.emergency],
                  ["Monnaie", dossier.practical.currency],
                  ["Prises", `${dossier.practical.plugs} · ${dossier.practical.voltage}`],
                  ["On roule à", dossier.practical.drive],
                  ["Pourboire", dossier.practical.tipping],
                  ["Entrée", dossier.practical.entry],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                      {label}
                    </dt>
                    <dd className="text-sm text-stone-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-stone-500">
                Informations indicatives. Les conditions d'entrée changent :{" "}
                <a
                  href={OFFICIAL_ADVICE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  vérifiez sur France Diplomatie
                </a>{" "}
                avant de réserver.
              </p>
            </section>
          )}

          {dossier.missing.length > 0 && (
            <section className="px-5 py-3">
              <p className="text-xs text-stone-400">
                Indisponible pour l'instant : {dossier.missing.join(", ").toLowerCase()}.
              </p>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

/** Shown while the free services are being asked. */
export function DossierSkeleton({ city }: { city: string }) {
  return (
    <Card title={`${city}, en pratique`}>
      <div className="space-y-3 px-5 py-5">
        <Badge className="bg-stone-100 text-stone-500 ring-stone-200">Chargement…</Badge>
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-stone-100" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-stone-100" />
      </div>
    </Card>
  );
}
