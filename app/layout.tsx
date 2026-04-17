import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital exhibit",
  description:
    "Curate six works from partner museums and share your exhibit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--canvas)] antialiased">{children}</body>
    </html>
  );
}
