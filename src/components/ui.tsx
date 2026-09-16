import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warning" | "positive";
}) {
  const toneRing =
    tone === "warning"
      ? "ring-amber-200 bg-amber-50/70"
      : tone === "positive"
        ? "ring-emerald-200 bg-emerald-50/70"
        : "ring-stone-200/80 bg-white";

  return (
    <div className={`rounded-2xl px-5 py-4 shadow-sm ring-1 ${toneRing}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-stone-900">{value}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-stone-500">{hint}</p>}
    </div>
  );
}

/** The one number the whole product exists to show. */
export function HeroStat({
  label,
  value,
  hint,
  aside,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-6 text-white shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-100">{label}</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1.5 text-sm text-brand-100">{hint}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Badge({
  children,
  className = "bg-stone-100 text-stone-700 ring-stone-200",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-base font-medium text-stone-700">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm text-stone-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs leading-relaxed text-stone-500">{hint}</p>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 shadow-sm outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-200 disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-60";

export function ErrorNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
      {message}
    </p>
  );
}

export function SuccessNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 ring-1 ring-emerald-200 ring-inset">
      {message}
    </p>
  );
}

/** A quiet note that a figure is not final yet. */
export function ProvisionalNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
      {children}
    </p>
  );
}

export function Meter({
  percent,
  over = false,
  className = "",
}: {
  percent: number;
  over?: boolean;
  className?: string;
}) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-stone-100 ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] ${over ? "bg-rose-500" : "bg-brand-600"}`}
        style={{ width: `${Math.max(percent, 2)}%` }}
      />
    </div>
  );
}

export function TableShell({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
          {head}
        </thead>
        <tbody className="divide-y divide-stone-100">{children}</tbody>
      </table>
    </div>
  );
}
