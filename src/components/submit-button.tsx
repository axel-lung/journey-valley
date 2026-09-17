"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export function SubmitButton({
  children,
  pendingLabel,
  className = buttonClass,
  name,
  value,
  formAction,
  onClick,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Pour ajuster l'écran au moment du clic, avant que l'action réponde. */
  onClick?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      onClick={onClick}
      disabled={pending}
      className={className}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
