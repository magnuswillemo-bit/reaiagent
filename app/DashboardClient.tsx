"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
// Alias Map to GoogleMap to prevent collision with native JS Map
import { APIProvider, Map as GoogleMap, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useSettings } from "../lib/SettingsContext";

// Helper component to handle bounding box logic inside the modern map context
const MapBounds = ({ sites }: { sites: any[] }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || sites.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    sites.forEach(site => bounds.extend({ lat: site.lat, lng: site.lng }));
    map.fitBounds(bounds);
  }, [map, sites]);
  return null;
};

export default function DashboardClient() {
  const router = useRouter();
  const { masterCurrency, units } = useSettings(); 
  
  const [metrics, setMetrics] = useState({
    active: 0,
    owned: 0,
    leased: 0,
    valuation: 0,
    rentLiability: 0,
    totalArea: 0,
  });
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [mapSites, setMapSites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMarker, setSelectedMarker] = useState<any>(null);

  useEffect(() => {
    fetchDashboardData();
  }, [masterCurrency]);

  const fetchDashboardData = async () => {
    setIsLoading(true);

    let exchangeRates: Record<string, number> = {};
    try {
      const fxRes = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`);
      const fxData = await fxRes.json();
      if (fxData && fxData.rates) {
        exchangeRates = fxData.rates;
      }
    } catch (err) {
      console.error("Failed to fetch live exchange rates", err);
    }

    const { data: assets, error: assetError } = await supabase.from("assets").select("*");
    if (assetError || !assets) {
      console.error("Error fetching assets", assetError);
      setIsLoading(false);
      return;
    }

    const { data: valuations } = await supabase.from("valuations").select("*").order("created_at", { ascending: false });
    
    // Native JS Map is now safely accessible
    const latestOwnedValuations = new Map();
    if (valuations) {
      valuations.forEach(val => {
        if (val.contract_type === "Owned" && !latestOwnedValuations.has(val.site_id)) {
          latestOwnedValuations.set(val.site_id, val);
        }
      });
    }

    let owned = 0, leased = 0, totalValuation = 0, rentLiability = 0, totalArea = 0;
    const upcoming: any[] = [];
    const mapData: any[] = [];
    const now = new Date();
    const eighteenMonths = new Date();
    eighteenMonths.setMonth(now.getMonth() + 18);

    assets.forEach((site) => {
      const contractType = (site.contract_type || "").trim().toLowerCase();
      
      if (contractType === "owned") {
        owned++;
        const valRecord = latestOwnedValuations.get(site.id);
        if (valRecord && valRecord.estimated_value) {
          const localCurr = (valRecord.currency || site.local_currency || "USD").toUpperCase();
          let convertedVal = valRecord.estimated_value;
          if (exchangeRates[localCurr]) {
            convertedVal = valRecord.estimated_value / exchangeRates[localCurr];
          }
          totalValuation += convertedVal;
        }
      } else {
        leased++;
        const localCost = site.annual_cost || 0;
        const localCurr = (site.local_currency || "USD").toUpperCase();
        let convertedCost = localCost;
        if (exchangeRates[localCurr]) {
          convertedCost = localCost / exchangeRates[localCurr];
        } 
        rentLiability += convertedCost;
      }
      
      totalArea += (site.sqm_building || 0) + (site.sqm_land || 0);

      if (site.lease_end) {
        const endDate = new Date(site.lease_end);
        if (endDate > now && endDate <= eighteenMonths) {
          const diffTime = Math.abs(endDate.getTime() - now.getTime());
          const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
          upcoming.push({ ...site, monthsLeft: diffMonths });
        }
      }

      if (site.latitude && site.longitude) {
        mapData.push({
          id: site.id,
          lat: parseFloat(site.latitude),
          lng: parseFloat(site.longitude),
          code: site.site_code,
          name: site.common_name,
          city: site.city,
          country: site.country
        });
      }
    });

    upcoming.sort((a, b) => new Date(a.lease_end).getTime() - new Date(b.lease_end).getTime());

    const activeSites = owned + leased;

    setMetrics({ 
      active: activeSites, 
      owned, 
      leased, 
      valuation: Math.ceil(totalValuation), 
      rentLiability: Math.ceil(rentLiability),
      totalArea: Math.ceil(totalArea)
    });
    
    setUpcomingEvents(upcoming);
    setMapSites(mapData);
    setIsLoading(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: masterCurrency, 
      maximumFractionDigits: 0 
    }).format(value);
  };

  const formatArea = (value: number) => {
    const convertedValue = units === "imperial" ? value * 10.7639 : value;
    const label = units === "imperial" ? "sqft" : "sqm";
    return new Intl.NumberFormat('en-US', { 
      maximumFractionDigits: 0 
    }).format(convertedValue) + " " + label;
  };

  const KpiCard = ({ title, value, subtitle }: { title: string, value: string | number, subtitle?: string }) => {
    const stringVal = String(value);
    const textSizeClass = stringVal.length > 12 ? "text-lg xl:text-xl" : stringVal.length > 9 ? "text-xl xl:text-2xl" : "text-2xl xl:text-3xl";

    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 relative overflow-hidden group hover:border-blue-300 transition-all flex flex-col justify-between min-h-[135px]">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        <div className="flex justify-between items-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate mr-2" title={title}>{title}</p>
          {subtitle && (
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0 transition-colors">
              {subtitle}
            </span>
          )}
        </div>

        <div className="mt-3">
          <p className={`${textSizeClass} font-black text-slate-900 tracking-tight transition-colors`} title={stringVal}>
            {value}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-2 border-b border-slate-200 mb-6 transition-colors">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4 transition-colors">Dashboard</h2>
        </div>
        <div onClick={fetchDashboardData} className="mb-4 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm text-sm font-semibold text-slate-600 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh Data
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6">
        <KpiCard title="Active Sites" value={isLoading ? "-" : metrics.active} />
        <KpiCard title="Owned Sites" value={isLoading ? "-" : metrics.owned} />
        <KpiCard title="Rented/Leased" value={isLoading ? "-" : metrics.leased} />
        <KpiCard title="Valuation (Owned)" value={isLoading ? "-" : formatCurrency(metrics.valuation)} subtitle={masterCurrency} />
        <KpiCard title="Annual Rent Liab." value={isLoading ? "-" : formatCurrency(metrics.rentLiability)} subtitle={masterCurrency} />
        <KpiCard title="Total Area" value={isLoading ? "-" : formatArea(metrics.totalArea)} subtitle={units === 'imperial' ? 'SQFT' : 'SQM'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-colors">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center transition-colors">
            <h3 className="font-bold text-slate-800 tracking-tight">Global Site Map</h3>
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
              Live View
            </span>
          </div>
          <div className="flex-1 w-full relative min-h-[400px]">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
              <GoogleMap
                mapId="dashboard-map"
                defaultZoom={2}
                defaultCenter={{ lat: 20, lng: 0 }}
                gestureHandling={"greedy"}
                disableDefaultUI={false}
                mapTypeControl={true}
                streetViewControl={false}
                styles={[
                  { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#525252" }] },
                  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
                  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
                  { featureType: "poi", stylers: [{ visibility: "off" }] }
                ]}
              >
                <MapBounds sites={mapSites} />
                {mapSites.map((site) => (
                  <Marker
                    key={site.id}
                    position={{ lat: site.lat, lng: site.lng }}
                    title={site.name}
                    icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                    onClick={() => setSelectedMarker(site)}
                  />
                ))}

                {selectedMarker && (
                  <InfoWindow
                    position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                    onCloseClick={() => setSelectedMarker(null)}
                  >
                    <div className="p-1.5 max-w-[220px]">
                      <p className="font-bold text-blue-600 text-[10px] uppercase tracking-wider mb-0.5">{selectedMarker.code}</p>
                      <p className="font-semibold text-slate-900 text-sm mb-1 leading-tight">{selectedMarker.name}</p>
                      <p className="text-xs text-slate-500 mb-3">{selectedMarker.city}, {selectedMarker.country}</p>
                      <button 
                        onClick={() => router.push(`/database?id=${selectedMarker.id}`)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-md shadow-sm transition-colors"
                      >
                        View Site →
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            </APIProvider>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-colors">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center transition-colors">
            <h3 className="font-bold text-slate-800 tracking-tight">Upcoming Events</h3>
          </div>
          <div className="flex-1 overflow-auto max-h-[400px]">
            {isLoading ? (
              <div className="flex justify-center items-center h-full p-8 text-slate-400">Loading events...</div>
            ) : upcomingEvents.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10 transition-colors">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Site Code</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Expiration</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {upcomingEvents.map((event, idx) => (
                    <tr
                      key={event.id || idx}
                      onClick={() => router.push(`/database?id=${event.id}`)}
                      title={`Open site profile for ${event.site_code} — ${event.common_name}`}
                      className="hover:bg-blue-50/60 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-blue-600 group-hover:text-blue-700 flex items-center gap-1">
                          <span>{event.site_code}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">→</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[120px]">{event.common_name}</p>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">{event.lease_end}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          event.monthsLeft <= 6 ? 'bg-rose-100 text-rose-700' : 
                          event.monthsLeft <= 12 ? 'bg-amber-100 text-amber-700' : 
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {event.monthsLeft} mo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col justify-center items-center h-full p-12 text-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3 transition-colors">
                  <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                </div>
                <p className="text-sm font-semibold text-slate-600">No Upcoming Expirations</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px]">There are no lease events scheduled within the next 18 months.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}