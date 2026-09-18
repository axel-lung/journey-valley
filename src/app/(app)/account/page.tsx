import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, buttonClass, secondaryButtonClass } from "@/components/ui";
import { homeStats } from "@/lib/analytics";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { checkCompliance } from "@/lib/legal";
import { AgencyForm } from "./agency-form";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { countActiveTrips } from "@/lib/trips";
import { changePlanAction } from "./actions";
import { ProfileForm } from "./profile-form";

export default async function AccountPage() {
  const user = await requireUser();
  const stats = homeStats(user.id);
  const active = countActiveTrips(user.id);
  const currentPlan = PLANS[user.plan];
  const advisor = isAdvisor(user);
  const agency = getAgency(user.agency_id);
  const compliance = checkCompliance(agency);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">
          {advisor ? "Mon agence" : "Mon compte"}
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          {advisor
            ? compliance.ready
              ? "Vos mentions légales sont complètes : vos devis sont présentables."
              : `${compliance.missing.length} mention${compliance.missing.length > 1 ? "s" : ""} manquante${compliance.missing.length > 1 ? "s" : ""} — vos devis ne sont pas conformes tant qu'elle${compliance.missing.length > 1 ? "s ne sont" : " n'est"} pas renseignée${compliance.missing.length > 1 ? "s" : ""}.`
            : `Forfait ${currentPlan.name}, ${active} voyage${active > 1 ? "s" : ""} en cours.`}
        </p>
      </header>

      {agency && (
        <Card title="La fiche de votre agence">
          <AgencyForm agency={agency} />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(PLANS).map((plan) => {
          const current = plan.id === user.plan;
          return (
            <Card key={plan.id} className={current ? "ring-2 ring-brand-200" : ""}>
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900">{plan.name}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-stone-500">{plan.tagline}</p>
                  </div>
                  {current && (
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Actuel</Badge>
                  )}
                </div>

                <p className="text-3xl font-semibold text-stone-900">
                  {plan.price_cents === 0 ? (
                    "Gratuit"
                  ) : (
                    <>
                      {formatMoney(plan.price_cents)}
                      <span className="text-sm font-normal text-stone-500"> / mois</span>
                    </>
                  )}
                </p>

                <ul className="space-y-2 text-sm text-stone-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <span aria-hidden className="text-brand-600">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {!current && (
                  <form action={changePlanAction}>
                    <input type="hidden" name="plan" value={plan.id} />
                    <SubmitButton
                      className={plan.id === "plus" ? buttonClass : secondaryButtonClass}
                      pendingLabel="Changement…"
                    >
                      {plan.id === "plus"
                        ? `Passer au forfait ${PLANS.plus.name}`
                        : `Revenir à l'${PLANS.free.name.toLowerCase()}`}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-stone-500">
        Dans cette démonstration, le changement de forfait est immédiat. En production il passerait
        par un prestataire de paiement, et ne prendrait effet qu'une fois le paiement confirmé.
      </p>

      <Card title="Vos informations">
        <ProfileForm user={user} />
      </Card>
    </div>
  );
}
