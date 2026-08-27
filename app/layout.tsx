import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";
import "./globals.css";

const monaSans = Mona_Sans({
  subsets: ["latin"],
  variable: "--font-mona-sans",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Poker Liga",
  description: "Gestion de ligas de poker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className={`${monaSans.variable} font-sans min-h-full flex flex-col bg-background text-foreground`}>
        {children}
      </body>
    </html>
  );
}
