import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "../lib/SettingsContext";
import { AuthProvider } from "../lib/AuthContext";
import Header from "./Header";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "reAIgent | Enterprise Real Estate",
  description: "Global Real Estate Portfolio & AI Analytics Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased selection:bg-blue-600 selection:text-white overflow-y-scroll">
        <AuthProvider>
          <SettingsProvider>
            
            <Header />

            <main className="flex-1 max-w-[1600px] w-full mx-auto p-8">
              {children}
            </main>

          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}