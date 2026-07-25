import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Request Triage",
  description:
    "Incoming request processing workflow — classification, branching, and audit for a lending operations desk.",
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
