"use client";

import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import "./globals.css";
import { SettingsProvider } from "../lib/SettingsContext";
import { AuthProvider } from "../lib/AuthContext";
import Header from "./Header";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [resetCounter, setResetCounter] = useState(0);

  useEffect(() => {
    const handleResetPage = () => {
      setResetCounter((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("reAIgent:reset-page", handleResetPage);
    return () => window.removeEventListener("reAIgent:reset-page", handleResetPage);
  }, []);

  return (
    <html lang="en" className={inter.className}>
      <head>
        <title>reAIgent | Enterprise Real Estate</title>
        <meta name="description" content="Global Real Estate Portfolio & AI Analytics Dashboard" />
      </head>
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased selection:bg-blue-600 selection:text-white overflow-y-scroll">
        <AuthProvider>
          <SettingsProvider>
            
            <Header />

            <main key={resetCounter} className="flex-1 max-w-[1600px] w-full mx-auto p-8">
              {children}
            </main>

          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}