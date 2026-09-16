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
        <Link href="/trips" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to trips
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Plan a trip</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only the name and where you are going are required — everything else can wait.
        </p>
      </header>

      {!limit.allowed ? (
        <Card title="You have reached your plan's limit">
          <div className="space-y-3 px-5 py-5 text-sm text-slate-700">
            <p>{limit.reason}</p>
            <p className="text-slate-500">
              {plan.name} keeps {plan.max_active_trips} trips active at a time. Completing a trip
              frees a slot, and Plus removes the limit entirely.
            </p>
            <Link
              href="/account"
              className="inline-block font-medium text-brand-600 hover:underline"
            >
              Compare the plans →
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
