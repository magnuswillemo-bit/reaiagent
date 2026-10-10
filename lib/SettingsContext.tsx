"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SettingsContextType {
  masterCurrency: string;
  setMasterCurrency: (currency: string) => void;
  units: "metric" | "imperial";
  setUnits: (units: "metric" | "imperial") => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [masterCurrency, setMasterCurrency] = useState("USD");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load stored settings on mount
    const savedCurrency = localStorage.getItem("masterCurrency");
    const savedUnits = localStorage.getItem("units") as "metric" | "imperial";
    
    if (savedCurrency) setMasterCurrency(savedCurrency);
    if (savedUnits) setUnits(savedUnits);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("masterCurrency", masterCurrency);
    localStorage.setItem("units", units);
  }, [masterCurrency, units, mounted]);

  return (
    <SettingsContext.Provider value={{ masterCurrency, setMasterCurrency, units, setUnits }}>
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