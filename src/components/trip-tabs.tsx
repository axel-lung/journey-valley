"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Les onglets d'un dossier.
 *
 * Ce sont de vrais liens vers de vraies routes, pas un état local : le retour
 * du navigateur fonctionne, chaque onglet s'envoie par message, et un
 * rafraîchissement retombe au même endroit. Les compteurs évitent d'ouvrir un
 * onglet pour découvrir qu'il est vide — c'est ce qui fait gagner les clics.
 */
export function TripTabs({
  tripId,
  counts,
}: {
  tripId: number;
  counts: { bookings: number; quotes: number; travellers: number; expenses: number };
}) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;

  const tabs = [
    { href: base, label: "Programme", count: counts.bookings },
    { href: `${base}/prix`, label: "Prix & marge", count: null },
    { href: `${base}/devis`, label: "Devis", count: counts.quotes },
    { href: `${base}/voyageurs`, label: "Voyageurs", count: counts.travellers },
    { href: `${base}/destination`, label: "Destination", count: null },
  ];

  return (
    <nav
      aria-label="Sections du dossier"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 pb-px"
    >
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800"
            }`}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  active ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-500"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
