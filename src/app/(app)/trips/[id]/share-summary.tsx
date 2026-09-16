"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/components/ui";

/**
 * The settle-up as plain text, ready to paste into the group chat where these
 * conversations actually happen.
 */
export function ShareSummary({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      // Clipboard access can be refused; the textarea below is the fallback.
      setState("failed");
    }
  }

  return (
    <div className="border-t border-stone-100 px-5 py-3.5">
      <button type="button" onClick={copy} className={secondaryButtonClass}>
        {state === "copied" ? "Copié ✓" : "Copier le récap"}
      </button>
      {state === "failed" && (
        <>
          <p className="mt-2 text-xs text-stone-500">
            Copie impossible depuis ce navigateur — sélectionnez le texte ci-dessous.
          </p>
          <textarea
            readOnly
            value={text}
            rows={Math.min(8, text.split("\n").length)}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-700"
          />
        </>
      )}
    </div>
  );
}
