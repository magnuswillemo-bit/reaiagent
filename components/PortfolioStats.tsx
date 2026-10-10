import React, { useContext } from 'react';

// Define the settings context type explicitly including currency and unitSystem
export type SettingsContextType = {
  currency: string;
  unitSystem: string;
  theme?: string;
};

// Mock or import your actual SettingsContext here
// Example: import { SettingsContext } from '@/context/SettingsContext';

const PortfolioStats: React.FC = () => {
  // If you are using a context, cast or type it safely:
  // const { currency, unitSystem } = useContext(SettingsContext) as SettingsContextType;

  // Fallback default values for demonstration if context is structured differently:
  const currency = 'USD';
  const unitSystem = 'metric';

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800">Portfolio Statistics</h3>
      <div className="mt-2 flex gap-4 text-sm text-gray-600">
        <span>Currency: <strong>{currency}</strong></span>
        <span>Units: <strong>{unitSystem}</strong></span>
      </div>
    </div>
  );
};

export default PortfolioStats;