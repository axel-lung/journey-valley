import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card, EmptyState, StatTile, TableShell } from "@/components/ui";
import { getClient, isAdvisor, listClientFiles } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { totalMargin } from "@/lib/margin";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";
import { SubmitButton } from "@/components/submit-button";
import { inviteClientAction } from "../actions";
import { ClientNotesForm } from "./notes-form";

export const dynamic = "force-dynamic";

/** La fiche d'un client : ses dossiers, ce qu'il pèse, ce qu'on sait de lui. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/trips");

  const { id } = await params;
  const client = user.agency_id ? getClient(user.agency_id, Number(id)) : null;
  if (!client) notFound();

  const files = listClientFiles(user.agency_id!, client.id);
  const counted = files.filter((file) => file.counts_towards_revenue);
  const totals = totalMargin(counted.map((file) => file.margin));
  const currency = user.currency;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clients" className="text-sm text-stone-500 hover:text-stone-900">
          ← Tous les clients
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{client.name}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {[client.email, client.phone].filter(Boolean).join(" · ") || "Aucun contact renseigné"}
            </p>
          </div>
          <Link
            href={`/trips/new?client=${client.id}`}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Nouveau dossier
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Dossiers" value={files.length} />
        <StatTile label="Vendu" value={formatMoney(totals.sell_cents, currency)} />
        <StatTile
          label="Marge"
          value={formatMoney(totals.margin_cents, currency)}
          tone={totals.margin_cents > 0 ? "positive" : "default"}
        />
        <StatTile
          label="Taux de marque"
          value={`${totals.margin_percent} %`}
          hint="Marge rapportée au prix de vente"
        />
      </div>

      <Card title="Ses dossiers">
        {files.length === 0 ? (
          <EmptyState
            title="Aucun dossier"
            hint="Ouvrez-lui un dossier : devis, carnet de voyage et marge suivent."
          />
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-5 py-3">Dossier</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Étape</th>
                <th className="px-5 py-3 text-right">Vendu</th>
                <th className="px-5 py-3 text-right">Marge</th>
              </tr>
            }
          >
            {files.map(({ trip, margin }) => (
              <tr key={trip.id} className="hover:bg-stone-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/trips/${trip.id}`}
                    className="font-medium text-stone-900 hover:text-brand-700"
                  >
                    {trip.title}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {trip.destination_city}, {trip.destination_country}
                  </p>
                </td>
                <td className="px-5 py-3 text-stone-600">
                  {formatDateRange(trip.start_date, trip.end_date)}
                </td>
                <td className="px-5 py-3">
                  <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-800">
                  {formatMoney(margin.sell_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <span className={margin.margin_cents > 0 ? "text-emerald-700" : "text-stone-500"}>
                    {formatMoney(margin.margin_cents, currency)}
                  </span>
                  {margin.partial && (
                    <span className="ml-1 text-xs text-amber-700" title="Des lignes n'ont pas de prix de vente">
                      ≈
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Fiche">
          <ClientNotesForm client={client} />
        </Card>
        <Card title="Espace voyageur">
          <div className="space-y-3 px-5 py-4 text-sm text-stone-600">
            <p>
              {client.user_id
                ? "Ce client a un accès : il voit ses dossiers, son programme et son carnet — jamais vos coûts ni vos marges."
                : client.email
                  ? "Ce client n'a pas encore d'accès. Envoyez-lui une invitation : il choisit son mot de passe et retrouve ses dossiers."
                  : "Ce client n'a pas encore d'accès, et sa fiche n'a pas d'adresse e-mail : ajoutez-en une pour pouvoir l'inviter."}
            </p>

            {!client.user_id && client.email && (
              <form action={inviteClientAction}>
                <input type="hidden" name="client_id" value={client.id} />
                <SubmitButton pendingLabel="Envoi…">Inviter {client.name}</SubmitButton>
              </form>
            )}

            <p className="text-xs text-stone-500">
              Client depuis le {formatDate(client.created_at.slice(0, 10))}.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
