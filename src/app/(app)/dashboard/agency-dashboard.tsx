import Link from "next/link";
import { Badge, Card, EmptyState, HeroStat, StatTile, buttonClass } from "@/components/ui";
import { agencyTotals, listAgencyFiles, type ClientFile } from "@/lib/agency";
import { countdown, formatDate, formatDateRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";
import type { Agency, TripStage, User } from "@/lib/types";

const PIPELINE: TripStage[] = ["idea", "planning", "booked", "travelling"];

/**
 * Le matin d'un conseiller : ce qui part bientôt, ce qui dort, ce que ça
 * rapporte.
 *
 * Les deux listes du bas sont les seules actions vraiment urgentes d'une
 * agence : un dossier sans prix de vente ne rapporte rien, et un devis qu'on ne
 * relance pas ne se transforme pas.
 */
export function AgencyDashboard({ user, agency }: { user: User; agency: Agency | null }) {
  const currency = user.currency;
  const files = user.agency_id ? listAgencyFiles(user.agency_id) : [];
  const totals = agencyTotals(files);

  const byStage = PIPELINE.map((stage) => ({
    stage,
    files: files.filter((file) => file.trip.stage === stage),
  }));

  const departing = files
    .filter((file) => countdown(file.trip.start_date, file.trip.end_date).upcoming)
    .sort((a, b) => a.trip.start_date.localeCompare(b.trip.start_date))
    .slice(0, 5);

  // Les dossiers dont la marge n'est pas un résultat : lignes sans prix de
  // vente, ou forfait vendu dont les achats ne sont pas tous saisis.
  const unsettled = files.filter((file) => file.margin.partial).slice(0, 5);

  const quotes = files.filter(
    (file) => file.trip.stage === "idea" || file.trip.stage === "planning",
  );

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Bonjour {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {departing[0]
              ? `Prochain départ : ${departing[0].trip.destination_city}, ${formatDate(departing[0].trip.start_date)} — ${countdown(departing[0].trip.start_date, departing[0].trip.end_date).label.toLowerCase()}.`
              : `${agency?.name ?? "Votre agence"} — aucun départ programmé.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/clients" className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            Nouveau client
          </Link>
          <Link href="/trips/new" className={buttonClass}>
            Nouveau dossier
          </Link>
        </div>
      </header>

      <HeroStat
        label="Marge sur les dossiers réservés"
        value={formatMoney(totals.margin_cents, currency)}
        hint={
          totals.files > 0
            ? `${totals.files} dossier${totals.files > 1 ? "s" : ""} · ${formatMoney(totals.sell_cents, currency)} vendus · ${totals.margin_percent} % de marque.`
            : "Rien de réservé pour l'instant : la marge se compte une fois les achats faits."
        }
        aside={
          <Link
            href="/marges"
            className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
          >
            Voir le détail →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        {byStage.map(({ stage, files: staged }) => (
          <StatTile
            key={stage}
            label={STAGE_LABEL[stage]}
            value={staged.length}
            hint={
              staged.length > 0
                ? formatMoney(
                    staged.reduce((total, file) => total + file.margin.sell_cents, 0),
                    currency,
                  )
                : "—"
            }
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Départs à venir">
          {departing.length === 0 ? (
            <EmptyState title="Aucun départ programmé" />
          ) : (
            <FileList files={departing} currency={currency} showMargin={false} />
          )}
        </Card>

        <Card title="Marges à confirmer">
          {unsettled.length === 0 ? (
            <EmptyState
              title="Toutes vos marges sont fermes"
              hint="Chaque dossier porte ses prix de vente et ses achats."
            />
          ) : (
            <>
              <p className="border-b border-stone-100 px-5 py-3 text-sm text-stone-500">
                Marges encore approximatives : une ligne sans prix de vente les tire vers le bas,
                un forfait dont les achats ne sont pas tous saisis les gonfle.
              </p>
              <FileList files={unsettled} currency={currency} showMargin />
            </>
          )}
        </Card>
      </div>

      <Card
        title={`Devis en cours (${quotes.length})`}
        action={
          <Link href="/trips" className="text-sm text-stone-500 hover:text-stone-900">
            Tous les dossiers →
          </Link>
        }
      >
        {quotes.length === 0 ? (
          <EmptyState
            title="Aucun devis en cours"
            hint="Créez un dossier pour un client : le devis, le carnet et la marge suivent."
          />
        ) : (
          <FileList files={quotes.slice(0, 6)} currency={currency} showMargin />
        )}
      </Card>
    </div>
  );
}

function FileList({
  files,
  currency,
  showMargin,
}: {
  files: ClientFile[];
  currency: string;
  showMargin: boolean;
}) {
  return (
    <ul className="divide-y divide-stone-100">
      {files.map(({ trip, margin }) => (
        <li key={trip.id}>
          <Link
            href={`/trips/${trip.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-stone-50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-stone-900">{trip.title}</p>
              <p className="text-xs text-stone-500">
                {trip.destination_city} · {formatDateRange(trip.start_date, trip.end_date)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {showMargin ? (
                <p className="text-sm tabular-nums text-stone-800">
                  {formatMoney(margin.margin_cents, currency as never)}
                  {margin.partial && <span className="ml-1 text-amber-600">≈</span>}
                </p>
              ) : (
                <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
