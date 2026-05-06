import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log Observatory",
  description: "Distributed Log Monitoring System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
