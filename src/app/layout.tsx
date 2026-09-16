import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journey Valley — organisez vos voyages, gardez la marge de l'agence",
  description:
    "Préparez vos voyages vous-même : budget, réservations, checklist, partage des frais entre voyageurs et comparaison avec un devis d'agence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">{children}</body>
    </html>
  );
}
