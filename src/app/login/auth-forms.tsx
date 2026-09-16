"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { loginAction, signupAction, type AuthState } from "./actions";

const fullWidthButton =
  "w-full justify-center rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60";

export function AuthForms({ demoEmail }: { demoEmail: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div>
      <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["signin", "signup"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setMode(entry)}
            className={`flex-1 rounded-md px-3 py-1.5 transition ${
              mode === entry ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {entry === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {mode === "signin" ? <SignInForm demoEmail={demoEmail} /> : <SignUpForm />}
      </div>
    </div>
  );
}

function SignInForm({ demoEmail }: { demoEmail: string }) {
  const [state, action] = useActionState<AuthState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorNotice message={state.error} />

      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={demoEmail}
          className={inputClass}
        />
      </Field>

      <Field label="Password">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={inputClass}
        />
      </Field>

      <SubmitButton className={fullWidthButton} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

function SignUpForm() {
  const [state, action] = useActionState<AuthState, FormData>(signupAction, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorNotice message={state.error} />

      <Field label="Your name">
        <input name="name" required autoComplete="name" placeholder="Camille Dupont" className={inputClass} />
      </Field>

      <Field label="Email">
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Home city">
          <input name="home_city" placeholder="Lyon" className={inputClass} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue="EUR" className={inputClass}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="GBP">GBP £</option>
            <option value="CHF">CHF</option>
          </select>
        </Field>
      </div>

      <SubmitButton className={fullWidthButton} pendingLabel="Creating…">
        Create my free account
      </SubmitButton>
      <p className="text-xs text-slate-500">
        Free plan, no card. Two active trips and one companion — upgrade later if you travel more.
      </p>
    </form>
  );
}
