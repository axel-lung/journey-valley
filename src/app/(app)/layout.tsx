import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav, type NavItem } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: "◎" },
    { href: "/trips", label: "Trips", icon: "✈" },
    { href: "/spending", label: "Spending", icon: "€" },
    { href: "/savings", label: "Savings", icon: "↓" },
    { href: "/account", label: "Account", icon: "☺" },
  ];

  const plan = PLANS[user.plan];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:border-b lg:border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-base text-white">
              ◇
            </span>
            <span className="text-sm font-semibold text-slate-900">Journey Valley</span>
          </Link>
        </div>

        <Nav items={items} />

        <div className="mt-auto hidden border-t border-slate-100 px-5 py-4 lg:block">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{plan.name} plan</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 lg:px-8">
          <p className="hidden text-sm text-slate-500 lg:block">
            {user.home_city ? `Home base: ${user.home_city}` : "Your travel workspace"}
          </p>
          <div className="flex items-center gap-3 lg:ml-auto">
            {user.plan === "free" && (
              <Link
                href="/account"
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 ring-inset hover:bg-brand-100"
              >
                Upgrade to Plus
              </Link>
            )}
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
              {initials(user.name)}
            </span>
            <form action={logoutAction} className="lg:hidden">
              <button type="submit" className="text-xs text-slate-500 hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
