"use client";

import { useSettings } from "../../lib/SettingsContext";

const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "SEK", "ZAR", "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", 
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", 
  "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", 
  "FJD", "FKP", "FOK", "GEL", "GGP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", 
  "IDR", "ILS", "IMP", "INR", "IQD", "IRR", "ISK", "JEP", "JMD", "JOD", "KES", "KGS", "KHR", "KID", "KMF", "KRW", 
  "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", 
  "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", 
  "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SGD", "SHP", 
  "SLL", "SOS", "SRD", "SSP", "STN", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TVD", "TWD", 
  "TZS", "UAH", "UGX", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF", "XPF", "YER", "ZMW", "ZWL"
];

export default function SettingsPage() {
  const { masterCurrency, setMasterCurrency, units, setUnits } = useSettings();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Standardized Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-2 border-b border-slate-200 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Platform Settings</h2>
          <p className="text-slate-500 text-sm">Manage your global portfolio preferences and localization.</p>
        </div>
      </header>

      <div className="space-y-8">
        
        {/* Localization Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800 tracking-tight">Localization</h3>
          </div>
          <div className="p-6 md:p-8 space-y-8">
            
            {/* Currency */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 border-b border-slate-100 pb-8">
              <div className="md:col-span-1">
                <h4 className="text-sm font-bold text-slate-900">Master Currency</h4>
                <p className="text-xs text-slate-500 mt-1">Select the global fiat currency used to aggregate financial reporting on the Dashboard.</p>
              </div>
              <div className="md:col-span-2">
                <select 
                  value={masterCurrency} 
                  onChange={(e) => setMasterCurrency(e.target.value)}
                  className="w-full max-w-xs bg-slate-50 border border-slate-200 text-slate-900 text-sm font-semibold rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-3 outline-none cursor-pointer transition-colors"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Units */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
              <div className="md:col-span-1">
                <h4 className="text-sm font-bold text-slate-900">Measurement System</h4>
                <p className="text-xs text-slate-500 mt-1">Choose between Metric (sqm) or Imperial (sqft) for surface area displays.</p>
              </div>
              <div className="md:col-span-2">
                <div className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button 
                    onClick={() => setUnits("metric")}
                    className={`px-6 py-2.5 text-sm font-bold rounded-md transition-all ${units === "metric" ? "bg-white text-blue-600 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Metric (sqm)
                  </button>
                  <button 
                    onClick={() => setUnits("imperial")}
                    className={`px-6 py-2.5 text-sm font-bold rounded-md transition-all ${units === "imperial" ? "bg-white text-blue-600 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Imperial (sqft)
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}