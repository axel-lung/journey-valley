import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/seed";
import { AuthForms } from "./auth-forms";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-brand-900 px-8 py-12 text-white lg:px-14">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 text-base">◇</span>
          Journey Valley
        </div>

        <div className="max-w-md py-12">
          <h1 className="text-3xl font-semibold leading-tight lg:text-4xl">
            Book your own trip. Keep the agency's margin.
          </h1>
          <p className="mt-4 text-brand-100">
            A package holiday hides the markup in one round number. Journey Valley keeps your
            flights, stays and activities in one place, tracks what everyone paid, and shows the
            gap between what you spent and what the agency quoted.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-brand-100">
            {[
              "Put the agency quote next to your own bookings, line by line",
              "One budget for the trip, split fairly between everyone on it",
              "See who owes whom when you get home — in the fewest payments",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span aria-hidden className="mt-0.5 text-white">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {Object.values(PLANS).map((plan) => (
              <div key={plan.id} className="rounded-xl bg-white/10 px-4 py-3">
                <p className="text-sm font-semibold">{plan.name}</p>
                <p className="text-lg font-semibold">
                  {plan.price_cents === 0 ? "Free" : `${formatMoney(plan.price_cents)}/month`}
                </p>
                <p className="mt-1 text-xs text-brand-100">{plan.tagline}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-brand-200">
          Demo account seeded with five real-shaped trips — Lisbon, Norway, Kyoto and more.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-slate-900">Start planning</h2>
          <p className="mt-1 text-sm text-slate-500">
            Create an account, or look around with the demo one.
          </p>

          <div className="mt-6">
            <AuthForms demoEmail={DEMO_EMAIL} />
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Demo account
            </p>
            <p className="mt-2 text-slate-700">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{DEMO_EMAIL}</code>{" "}
              <span className="text-slate-500">/</span>{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{DEMO_PASSWORD}</code>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Camille travels with Sam and Noor; the same password works for{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">sam@journeyvalley.app</code> if you
              want to see a trip from a companion's side.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
