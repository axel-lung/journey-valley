import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, StatTile, TableShell } from "@/components/ui";
import { isAdvisor, listClients } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { NewClientForm } from "./new-client-form";

export const dynamic = "force-dynamic";

/**
 * Le fichier clients — ce qu'une agence garde aujourd'hui dans un tableur, avec
 * ce que chacun a rapporté à côté de son nom.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/trips");

  const { q } = await searchParams;
  const clients = user.agency_id ? listClients(user.agency_id, q ?? "") : [];
  const currency = user.currency;

  const sold = clients.reduce((total, client) => total + client.sold_cents, 0);
  const margin = clients.reduce((total, client) => total + client.margin_cents, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Clients</h1>
        <p className="mt-1 text-sm text-stone-500">
          Vos voyageurs, leurs dossiers et ce qu'ils ont rapporté.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Clients" value={clients.length} />
        <StatTile label="Vendu" value={formatMoney(sold, currency)} hint="Dossiers confirmés" />
        <StatTile
          label="Marge"
          value={formatMoney(margin, currency)}
          tone={margin > 0 ? "positive" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card
          title="Fichier clients"
          action={
            <form className="flex gap-2">
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Chercher un nom"
                className="w-40 rounded-xl border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
              />
            </form>
          }
        >
          {clients.length === 0 ? (
            <EmptyState
              title={q ? "Aucun client à ce nom" : "Aucun client pour l'instant"}
              hint={
                q
                  ? "Essayez une autre orthographe."
                  : "Ajoutez-en un ici, puis ouvrez-lui un dossier : le devis, le carnet et la marge suivent."
              }
            />
          ) : (
            <TableShell
              head={
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Dossiers</th>
                  <th className="px-5 py-3 text-right">Vendu</th>
                  <th className="px-5 py-3 text-right">Marge</th>
                  <th className="px-5 py-3">Dernier départ</th>
                </tr>
              }
            >
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-stone-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium text-stone-900 hover:text-brand-700"
                    >
                      {client.name}
                    </Link>
                    <p className="text-xs text-stone-500">{client.email || client.phone || "—"}</p>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-stone-600">{client.trips}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-stone-800">
                    {formatMoney(client.sold_cents, currency)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right tabular-nums ${
                      client.margin_cents > 0 ? "text-emerald-700" : "text-stone-500"
                    }`}
                  >
                    {formatMoney(client.margin_cents, currency)}
                  </td>
                  <td className="px-5 py-3 text-stone-500">
                    {client.last_departure ? formatDate(client.last_departure) : "—"}
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>

        <Card title="Nouveau client">
          <NewClientForm />
        </Card>
      </div>
    </div>
  );
}
