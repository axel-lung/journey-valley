"use client";

import { SubmitButton } from "@/components/submit-button";
import { retryMessageAction } from "./actions";

export function RetryButton({ messageId }: { messageId: number }) {
  return (
    <form action={retryMessageAction}>
      <input type="hidden" name="message_id" value={messageId} />
      <SubmitButton pendingLabel="Envoi…">Réessayer</SubmitButton>
    </form>
  );
}
