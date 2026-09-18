"use client";

import { useState } from "react";

/**
 * Copier le message tel quel.
 *
 * C'est la porte de sortie quand l'envoi n'est pas branché : l'objet et le
 * corps partent dans le presse-papiers, et le conseiller colle dans sa
 * messagerie. `navigator.clipboard` n'existe pas partout, d'où la sélection de
 * secours — un bouton qui ne fait rien serait pire que pas de bouton.
 */
export function CopyBody({ subject, body }: { subject: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  const full = `${subject}\n\n${body}`;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setShown(true);
          }
        }}
        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
      >
        {copied ? "Copié" : "Copier le message"}
      </button>

      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        className="text-xs text-stone-400 hover:text-stone-700"
      >
        {shown ? "Masquer le texte" : "Voir le texte"}
      </button>

      {shown && (
        <textarea
          readOnly
          data-message-body
          value={full}
          rows={10}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 w-full min-w-72 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700"
        />
      )}
    </div>
  );
}
