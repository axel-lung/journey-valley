"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { loginAction, signupAction, type AuthState } from "./actions";

const fullWidthButton =
  "w-full justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60";

export function AuthForms({ demoEmail }: { demoEmail: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div>
      <div className="flex rounded-xl bg-stone-100 p-1 text-sm font-medium">
        {(
          [
            { key: "signin", label: "J'ai un compte" },
            { key: "signup", label: "Je m'inscris" },
          ] as const
        ).map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setMode(entry.key)}
            className={`flex-1 rounded-lg px-3 py-2 transition ${
              mode === entry.key
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {entry.label}
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
    <>
      <form action={action} className="space-y-4">
        <ErrorNotice message={state.error} />

        <Field label="E-mail">
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={demoEmail}
            className={inputClass}
          />
        </Field>

        <Field label="Mot de passe">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={inputClass}
          />
        </Field>

        <SubmitButton className={fullWidthButton} pendingLabel="Connexion…">
          Se connecter
        </SubmitButton>
      </form>

      <p className="mt-4 text-center text-sm">
        <a href="/mot-de-passe" className="text-stone-500 hover:text-stone-900">
          Mot de passe oublié ?
        </a>
      </p>
    </>
  );
}

function SignUpForm() {
  const [state, action] = useActionState<AuthState, FormData>(signupAction, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorNotice message={state.error} />

      <Field label="Votre prénom et nom">
        <input name="name" required autoComplete="name" placeholder="Camille Dupont" className={inputClass} />
      </Field>

      <Field
        label="Nom de votre agence"
        hint="Laissez vide si vous êtes voyageur : votre conseiller vous ouvrira l'accès à vos dossiers."
      >
        <input
          name="agency_name"
          autoComplete="organization"
          placeholder="Escale Voyages"
          className={inputClass}
        />
      </Field>

      <Field label="E-mail">
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </Field>

      <Field label="Mot de passe" hint="Au moins 8 caractères.">
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
        <Field label="Ville">
          <input name="home_city" placeholder="Lyon" className={inputClass} />
        </Field>
        <Field label="Devise">
          <select name="currency" defaultValue="EUR" className={inputClass}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="GBP">GBP £</option>
            <option value="CHF">CHF</option>
          </select>
        </Field>
      </div>

      <SubmitButton className={fullWidthButton} pendingLabel="Création…">
        Créer mon compte gratuit
      </SubmitButton>
      <p className="text-xs leading-relaxed text-stone-500">
        Sans carte bancaire. Vous créez vos clients, vos dossiers et vos devis dès la première
        minute ; vos voyageurs, eux, ne voient jamais vos coûts d'achat.
      </p>
    </form>
  );
}
