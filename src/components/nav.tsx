"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:overflow-visible lg:px-3 lg:py-4">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-brand-50 text-brand-700"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            <span aria-hidden className="w-4 text-center text-base leading-none">
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.badge ? (
              <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
