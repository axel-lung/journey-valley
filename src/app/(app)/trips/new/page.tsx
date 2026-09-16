import Link from "next/link";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { canCreateTrip, PLANS } from "@/lib/plans";
import { countActiveTrips } from "@/lib/trips";
import { TripForm } from "./trip-form";

export default async function NewTripPage() {
  const user = await requireUser();
  const active = countActiveTrips(user.id);
  const limit = canCreateTrip(user.plan, active);
  const plan = PLANS[user.plan];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <Link href="/trips" className="text-sm text-stone-500 hover:text-stone-900">
          ← Retour aux voyages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">Un nouveau voyage</h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Seuls le nom et la destination sont obligatoires. Le reste peut attendre.
        </p>
      </header>

      {!limit.allowed ? (
        <Card title="Vous avez atteint la limite de votre forfait">
          <div className="space-y-3 px-5 py-5 text-sm text-stone-700">
            <p>{limit.reason}</p>
            <p className="text-stone-500">
              {plan.name} garde {plan.max_active_trips} voyages en cours à la fois. Terminer un
              voyage libère une place, et Plus enlève la limite.
            </p>
            <Link href="/account" className="inline-block font-semibold text-brand-600 hover:underline">
              Comparer les forfaits →
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="px-5 py-5">
            <TripForm currency={user.currency} />
          </div>
        </Card>
      )}
    </div>
  );
}
