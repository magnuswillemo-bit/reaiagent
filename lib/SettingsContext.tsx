"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SettingsContextType {
  masterCurrency: string;
  setMasterCurrency: (currency: string) => void;
  units: "metric" | "imperial";
  setUnits: (units: "metric" | "imperial") => void;
  isHydrated: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [masterCurrency, setMasterCurrency] = useState("USD");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Load stored settings on mount safely without breaking SSR
    const savedCurrency = localStorage.getItem("masterCurrency");
    const savedUnits = localStorage.getItem("units") as "metric" | "imperial";
    
    if (savedCurrency) setMasterCurrency(savedCurrency);
    if (savedUnits) setUnits(savedUnits);
    
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem("masterCurrency", masterCurrency);
    localStorage.setItem("units", units);
  }, [masterCurrency, units, isHydrated]);

  return (
    <SettingsContext.Provider value={{ masterCurrency, setMasterCurrency, units, setUnits, isHydrated }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}