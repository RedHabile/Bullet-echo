import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BULLET ECHO — Shoot. Bounce. Echo.",
  description: "A fast neon arcade shooter where your bullets echo off the walls. Solo and 2-player local duel.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05020f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#05020f] text-white antialiased">{children}</body>
    </html>
  );
}
