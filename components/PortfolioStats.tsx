"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../lib/SettingsContext";

export default function PortfolioStats({ assets }: { assets: any[] }) {
  const { currency, unitSystem } = useSettings();
  const [rates, setRates] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRates() {
      setIsLoading(true);
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        setRates(data.rates);
      } catch (error) {
        console.error("Failed to fetch exchange rates", error);
      }
      setIsLoading(false);
    }
    fetchRates();
  }, []);

  // 1. Filter Logic
  const activeAssets = assets?.filter(a => a.status === "Operational" || a.status === "Not in Operation") || [];
  const ownedSites = activeAssets.filter(a => a.contract_type === "Owned");
  const leasedSites = activeAssets.filter(a => a.contract_type === "Leased" || a.contract_type === "Rented");

  // 2. Multi-Currency Financial Logic
  let valuationSum = 0;
  let annualRentSum = 0;

  if (rates) {
    // Calculate Valuation for Owned Sites
    ownedSites.forEach(asset => {
      if (asset.valuation) {
        const rateFromLocal = rates[asset.local_currency || "USD"] || 1;
        const rateToGlobal = rates[currency] || 1;
        valuationSum += (asset.valuation / rateFromLocal) * rateToGlobal;
      }
    });

    // Calculate Rent Liability for Leased/Rented Sites
    leasedSites.forEach(asset => {
      if (asset.annual_cost) {
        const rateFromLocal = rates[asset.local_currency || "USD"] || 1;
        const rateToGlobal = rates[currency] || 1;
        annualRentSum += (asset.annual_cost / rateFromLocal) * rateToGlobal;
      }
    });
  }

  // 3. Area Logic
  const totalAreaSqm = activeAssets.reduce((sum, asset) => sum + (Number(asset.sqm_land) || 0) + (Number(asset.sqm_building) || 0), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency, maximumFractionDigits: 0 }).format(amount);
  };

  const formatArea = (sqm: number) => {
    if (unitSystem === "Imperial") {
      return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(sqm * 10.7639)} sqft`;
    }
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(sqm)} sqm`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <p className="text-sm text-gray-500 font-medium">Active Sites</p>
        <p className="text-3xl font-bold text-gray-800 mt-2">{activeAssets.length}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <p className="text-sm text-gray-500 font-medium">Owned Sites</p>
        <p className="text-3xl font-bold text-gray-800 mt-2">{ownedSites.length}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <p className="text-sm text-gray-500 font-medium">Leased/Rented Sites</p>
        <p className="text-3xl font-bold text-gray-800 mt-2">{leasedSites.length}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <p className="text-sm text-gray-500 font-medium">Valuation Sum (Owned)</p>
        <p className="text-3xl font-bold text-blue-600 mt-2">{isLoading ? "..." : formatCurrency(valuationSum)}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <p className="text-sm text-gray-500 font-medium">Annual Rent Liability</p>
        <p className="text-3xl font-bold text-red-600 mt-2">{isLoading ? "..." : formatCurrency(annualRentSum)}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <p className="text-sm text-gray-500 font-medium">Total Area</p>
        <p className="text-3xl font-bold text-gray-800 mt-2">{formatArea(totalAreaSqm)}</p>
      </div>
    </div>
  );
}