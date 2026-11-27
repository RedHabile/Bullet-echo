import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE HOLLOW — survivez au boucher",
  description:
    "Chasse d'horreur dans le navigateur, en français. Cinq fusibles, une porte, deux cartes, des armes — seul contre le boucher-robot ou en session multijoueur en ligne avec un ami.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#04050a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nosifer&family=Special+Elite&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#04050a] text-[#d9d2c0] antialiased">{children}</body>
    </html>
  );
}
