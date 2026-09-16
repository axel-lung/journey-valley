import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav, type NavItem } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items: NavItem[] = [
    { href: "/dashboard", label: "Accueil", icon: "◎" },
    { href: "/trips", label: "Mes voyages", icon: "✈" },
    { href: "/spending", label: "Dépenses", icon: "€" },
    { href: "/savings", label: "Économies", icon: "↓" },
    { href: "/account", label: "Mon compte", icon: "☺" },
  ];

  const plan = PLANS[user.plan];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-stone-200 bg-white lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-5 py-4 lg:border-b lg:border-stone-100">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-lg text-white">
              ◇
            </span>
            <span className="text-sm font-semibold text-stone-900">Journey Valley</span>
          </Link>
        </div>

        <Nav items={items} />

        <div className="mt-auto hidden border-t border-stone-100 px-5 py-4 lg:block">
          <p className="truncate text-sm font-medium text-stone-900">{user.name}</p>
          <p className="truncate text-xs text-stone-500">Forfait {plan.name}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-3 lg:px-8">
          <p className="hidden text-sm text-stone-500 lg:block">
            {user.home_city ? `Au départ de ${user.home_city}` : "Vos voyages"}
          </p>
          <div className="flex items-center gap-3 lg:ml-auto">
            {user.plan === "free" && (
              <Link
                href="/account"
                className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset hover:bg-brand-100"
              >
                Passer à Plus
              </Link>
            )}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-stone-900">{user.name}</p>
              <p className="text-xs text-stone-500">{user.email}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
              {initials(user.name)}
            </span>
            <form action={logoutAction} className="lg:hidden">
              <button type="submit" className="text-xs text-stone-500 hover:text-stone-900">
                Quitter
              </button>
            </form>
          </div>
        </header>

        <main className="px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
