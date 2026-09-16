import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journey Valley — corporate travel management",
  description:
    "Trip requests, approvals, travel policy compliance and expense tracking for distributed teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
