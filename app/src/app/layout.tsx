import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MILK — Memory Isolation Layer Kit",
  description:
    "Privacy is a state transition, not a place. Zero-knowledge private transfers on Solana.",
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
  openGraph: {
    title: "MILK — Memory Isolation Layer Kit",
    description: "Zero-knowledge private transfers on Solana. No pools. No relayers. No trust.",
    url: "https://milkprotocol.tech",
    siteName: "MILK Protocol",
    images: [{ url: "/logo.jpg", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MILK — Memory Isolation Layer Kit",
    description: "Zero-knowledge private transfers on Solana.",
    images: ["/logo.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bungee&family=Fredoka:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
