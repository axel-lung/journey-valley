import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/seed";
import { AuthForms } from "./auth-forms";

const PROMISES = [
  {
    title: "Le vrai prix, en face du devis",
    body: "Notez ce qu'une agence vous a proposé. L'app met vos réservations en face, ligne par ligne.",
  },
  {
    title: "Un budget qui tient",
    body: "Ce qui est engagé, ce qu'il reste, et le coût par personne — avant que la note arrive.",
  },
  {
    title: "Les comptes entre amis, réglés",
    body: "Chacun paie ce qu'il peut sur place, l'app dit qui doit quoi à la fin, en un minimum de virements.",
  },
  {
    title: "Rien d'oublié au départ",
    body: "Une checklist par voyage : passeport, assurance, adaptateur, ce que vous voulez.",
  },
];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand-900 px-8 py-12 text-white lg:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.62 0.13 235), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.72 0.15 45), transparent 70%)" }}
        />

        <div className="relative flex items-center gap-2.5 text-sm font-semibold tracking-wide">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-lg">◇</span>
          Journey Valley
        </div>

        <div className="relative max-w-lg py-12">
          <h1 className="text-4xl font-semibold leading-[1.1] lg:text-5xl">
            Partez comme vous voulez.
            <br />
            Gardez la marge de l'agence.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-brand-100">
            Un forfait tout compris cache sa commission dans un chiffre rond. Ici, vos vols, vos
            logements et vos activités sont au même endroit — et l'écart avec le devis se voit.
          </p>

          <ul className="mt-9 grid gap-4 sm:grid-cols-2">
            {PROMISES.map((promise) => (
              <li key={promise.title} className="rounded-2xl bg-white/10 px-4 py-3.5 backdrop-blur-sm">
                <p className="text-sm font-semibold">{promise.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-brand-100">{promise.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-brand-100">
            {Object.values(PLANS).map((plan) => (
              <span key={plan.id} className="rounded-full bg-white/10 px-3.5 py-1.5">
                <strong className="text-white">{plan.name}</strong>{" "}
                {plan.price_cents === 0 ? "gratuit" : `${formatMoney(plan.price_cents)} / mois`}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-brand-200">
          Compte de démonstration rempli avec cinq voyages : Lisbonne, la Norvège, Kyoto et
          d'autres.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-stone-900">On commence ?</h2>
          <p className="mt-1.5 text-sm text-stone-500">
            Créez votre compte, ou faites le tour avec la démo.
          </p>

          <div className="mt-6">
            <AuthForms demoEmail={DEMO_EMAIL} />
          </div>

          <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Compte de démonstration
            </p>
            <p className="mt-2 text-stone-700">
              <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{DEMO_EMAIL}</code>{" "}
              <span className="text-stone-400">/</span>{" "}
              <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{DEMO_PASSWORD}</code>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Camille voyage avec Sam et Noor. Le même mot de passe marche pour{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5">sam@journeyvalley.app</code> si
              vous voulez voir un voyage côté invité.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
