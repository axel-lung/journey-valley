import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, buttonClass, secondaryButtonClass } from "@/components/ui";
import { homeStats } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          You are on the {currentPlan.name} plan, with {active} active trip
          {active === 1 ? "" : "s"} and {formatMoney(stats.saved_cents, user.currency)} saved against
          agency quotes so far.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(PLANS).map((plan) => {
          const current = plan.id === user.plan;
          return (
            <Card key={plan.id} className={current ? "ring-2 ring-brand-200" : ""}>
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{plan.name}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{plan.tagline}</p>
                  </div>
                  {current && (
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Current</Badge>
                  )}
                </div>

                <p className="text-2xl font-semibold text-slate-900">
                  {plan.price_cents === 0 ? (
                    "Free"
                  ) : (
                    <>
                      {formatMoney(plan.price_cents)}
                      <span className="text-sm font-normal text-slate-500"> / month</span>
                    </>
                  )}
                </p>

                <ul className="space-y-1.5 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
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
                      pendingLabel="Switching…"
                    >
                      {plan.id === "plus" ? "Upgrade to Plus" : "Move back to Free"}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        This demo switches plans immediately. In production the upgrade would go through a payment
        provider and the plan would change once payment is confirmed.
      </p>

      <Card title="Your details">
        <ProfileForm user={user} />
      </Card>
    </div>
  );
}
