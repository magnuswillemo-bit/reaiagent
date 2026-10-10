"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

export default function ValuationPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [contractFilter, setContractFilter] = useState<"Owned" | "Rented/Leased" | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  
  const [assessment, setAssessment] = useState<string | null>(null);
  const [estimatedValue, setEstimatedValue] = useState<number | null>(null);
  const [confidenceRating, setConfidenceRating] = useState<string | null>(null);
  const [confidenceExplanation, setConfidenceExplanation] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastValuations, setPastValuations] = useState<any[]>([]);
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  useEffect(() => {
    fetchSitesAndValuations();
  }, []);

  const fetchSitesAndValuations = async () => {
    const { data: siteData } = await supabase.from("assets").select("*").eq("status", "Operational").order("site_code", { ascending: true });
    if (siteData) setSites(siteData);

    const { data: valData } = await supabase.from("valuations").select("*, assets(site_code, common_name, annual_cost)").order("created_at", { ascending: false });
    if (valData) setPastValuations(valData);
  };

  const filteredSites = sites.filter(site => {
    if (!contractFilter) return false;
    const type = (site.contract_type || "").trim().toLowerCase() === "owned" ? "Owned" : "Rented/Leased";
    return type === contractFilter;
  });

  useEffect(() => {
    setSelectedSiteId("");
    setAssessment(null);
    setEstimatedValue(null);
    setConfidenceRating(null);
    setConfidenceExplanation(null);
    setError(null);
    setExportSuccess(false);
    setPdfSuccess(false);
  }, [contractFilter]);
  
  useEffect(() => {
    setExportSuccess(false);
    setPdfSuccess(false);
  }, [selectedSiteId]);

  const handleRunValuation = async () => {
    if (!selectedSiteId) return;
    
    const targetSite = sites.find(s => s.id.toString() === selectedSiteId);
    if (!targetSite) return;

    setIsLoading(true);
    setAssessment(null);
    setEstimatedValue(null);
    setConfidenceRating(null);
    setConfidenceExplanation(null);
    setError(null);
    setExportSuccess(false);
    setPdfSuccess(false);

    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: targetSite }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch valuation");

      setAssessment(data.assessment);
      setEstimatedValue(data.estimated_value);
      setConfidenceRating(data.confidence_rating);
      setConfidenceExplanation(data.confidence_explanation);

      const { error: insertError } = await supabase.from("valuations").insert([{
        site_id: targetSite.id,
        contract_type: contractFilter,
        assessment: data.assessment,
        estimated_value: data.estimated_value,
        currency: targetSite.local_currency || "USD"
      }]);

      if (!insertError) fetchSitesAndValuations();

    } catch (err: any) {
      setError(`Error: ${err.message}. Please try again later.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportToDatabase = async () => {
    if (!selectedSiteId || estimatedValue === null) return;
    setIsExporting(true);
    setError(null);

    const updateField = contractFilter === "Owned" ? "ai_fair_market_value" : "ai_fair_market_rent";
    
    const { error: exportError } = await supabase
      .from("assets")
      .update({ [updateField]: estimatedValue, ai_valuation_date: new Date().toISOString() })
      .eq("id", selectedSiteId);

    if (exportError) setError(`Database Export Failed: ${exportError.message}`);
    else setExportSuccess(true);
    
    setIsExporting(false);
  };

  const handleSavePdf = async () => {
    if (!selectedSiteId || !assessment) return;
    setIsSavingPdf(true);
    setError(null);
    
    try {
      // Switch to html-to-image to perfectly support modern CSS color functions like lab()
      const { toPng } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');

      const reportElement = document.getElementById("valuation-report-content");
      if (!reportElement) throw new Error("Report content not found");

      // Temporarily adjust padding to ensure clean PDF edges
      const originalPadding = reportElement.style.padding;
      reportElement.style.padding = "24px";
      
      const imgData = await toPng(reportElement, { 
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      
      reportElement.style.padding = originalPadding; // Reset

      const pdf = new jsPDF("p", "mm", "a4");
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Handle multi-page generation
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      const pdfBlob = pdf.output("blob");
      
      // Determine Naming Convention
      const targetSite = sites.find(s => s.id.toString() === selectedSiteId);
      const dateStr = new Date().toISOString().split('T')[0];
      const reportType = contractFilter === "Owned" ? "FMV" : "FMR";
      const fileName = `${dateStr}_${targetSite.site_code}_${reportType}_Report.pdf`;

      // Upload Blob to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL and save to Document Repository
      const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('site_documents').insert([{
        site_id: targetSite.id,
        file_name: fileName,
        file_size: pdfBlob.size,
        file_type: 'application/pdf',
        file_url: publicUrlData.publicUrl,
        uploaded_by: "System"
      }]);

      if (dbError) throw dbError;

      setPdfSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(`Failed to save PDF: ${err.message}`);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const getConfidenceColors = (level: string) => {
    switch(level?.toLowerCase()) {
      case 'high': return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case 'medium': return "bg-amber-100 text-amber-800 border-amber-200";
      case 'low': return "bg-rose-100 text-rose-800 border-rose-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const formatAssessment = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="text-lg font-bold text-slate-900 mt-6 mb-2">{line.replace('## ', '')}</h3>;
      if (line.startsWith('**') && line.includes('**:')) return <p key={i} className="mb-2"><strong className="text-slate-800">{line.split('**:')[0].replace('**', '')}:</strong>{line.split('**:')[1]}</p>;
      if (line.startsWith('* ') || line.startsWith('- ')) return <li key={i} className="ml-4 mb-1 text-slate-700">{line.substring(2).replace(/\*\*/g, '')}</li>;
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} className="mb-2 text-slate-700">{line.replace(/\*\*/g, '')}</p>;
    });
  };

  const getMarketPosition = (currentCost: number | undefined | null, fmr: number | undefined | null) => {
    if (!currentCost || !fmr || fmr === 0) return { label: "N/A", class: "bg-slate-100 text-slate-600 border border-slate-200" };
    const upperThreshold = fmr * 1.15;
    const lowerThreshold = fmr * 0.85;

    if (currentCost > upperThreshold) return { label: "Above Market", class: "bg-rose-100 text-rose-700 border border-rose-200" };
    if (currentCost < lowerThreshold) return { label: "Below Market", class: "bg-emerald-100 text-emerald-700 border border-emerald-200" };
    return { label: "On Market", class: "bg-slate-100 text-slate-700 border border-slate-200" };
  };

  const ownedHistory = pastValuations.filter(v => v.contract_type === "Owned");
  const rentedHistory = pastValuations.filter(v => v.contract_type === "Rented/Leased");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-2 border-b border-slate-200 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">Valuation Tool</h2>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 sticky top-8">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-6 border-b border-slate-100 pb-3">Analysis Configuration</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-3 uppercase">1. Select Asset Class</label>
                <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner border border-slate-200">
                  <button 
                    onClick={() => setContractFilter("Owned")}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-md transition-all ${contractFilter === "Owned" ? "bg-white text-blue-700 shadow border border-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                  >
                    Owned Assets
                  </button>
                  <button 
                    onClick={() => setContractFilter("Rented/Leased")}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-md transition-all ${contractFilter === "Rented/Leased" ? "bg-white text-blue-700 shadow border border-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                  >
                    Rented / Leased
                  </button>
                </div>
              </div>

              <div className={`transition-opacity duration-300 ${!contractFilter ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">2. Target Site Selection</label>
                <select 
                  value={selectedSiteId} 
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-3 outline-none cursor-pointer"
                >
                  <option value="">-- Select a site to analyze --</option>
                  {filteredSites.map(site => (
                    <option key={site.id} value={site.id}>
                      {site.site_code} {site.common_name} ({site.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={handleRunValuation}
                  disabled={!selectedSiteId || isLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {isLoading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Running Analytics...</>
                  ) : (
                    <><span className="text-lg leading-none">✨</span> Generate AI Assessment</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col">
            <div className="bg-slate-50 px-8 py-5 border-b border-slate-200 flex justify-end items-center rounded-t-2xl min-h-[64px]">
              {assessment && (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-md">
                  Analysis Complete
                </span>
              )}
            </div>
            
            <div className="flex-1 p-8 overflow-y-auto">
              {!assessment && !isLoading && !error && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 border border-slate-200">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <p className="text-slate-600 font-semibold">Awaiting Configuration</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">Select an asset class and target site from the menu to generate a market valuation report.</p>
                </div>
              )}

              {isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-800 font-bold">Querying Macroeconomic Data...</p>
                  <p className="text-sm text-slate-500 mt-1">Calculating regional comparables and extracting numeric values.</p>
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium">
                  {error}
                </div>
              )}

              {assessment && !isLoading && (
                <div>
                  {estimatedValue !== null && estimatedValue > 0 && (
                    <div className="mb-8 p-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          {contractFilter === "Owned" ? "Calculated Capital Value" : "Fair Market Annual Rent"}
                        </p>
                        <p className="text-3xl font-black text-slate-900">{estimatedValue.toLocaleString()} {sites.find(s => s.id.toString() === selectedSiteId)?.local_currency || "USD"}</p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <button 
                          onClick={handleSavePdf}
                          disabled={isSavingPdf || pdfSuccess}
                          className={`px-5 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 ${
                            pdfSuccess ? "bg-slate-800 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          {pdfSuccess ? (
                            <><span>✓</span> Saved to Documents</>
                          ) : isSavingPdf ? (
                            <><div className="w-4 h-4 border-2 border-slate-700/30 border-t-slate-700 rounded-full animate-spin"></div> Generating PDF...</>
                          ) : (
                            <><span>📄</span> Save Report (PDF)</>
                          )}
                        </button>

                        <button 
                          onClick={handleExportToDatabase}
                          disabled={isExporting || exportSuccess}
                          className={`px-5 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 ${
                            exportSuccess ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50"
                          }`}
                        >
                          {exportSuccess ? (
                            <><span>✓</span> Database Exported</>
                          ) : isExporting ? (
                            <><div className="w-4 h-4 border-2 border-emerald-700/30 border-t-emerald-700 rounded-full animate-spin"></div> Exporting...</>
                          ) : (
                            <><span>↗</span> Export Value to DB</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* The Document Wrapper for PDF Generation */}
                  <div id="valuation-report-content" className="bg-white rounded-lg pt-2 pb-6 px-1">
                    
                    {/* Clean Header specifically designed to look good on the PDF */}
                    <div className="mb-8 pb-4 border-b border-slate-200">
                      <h2 className="text-2xl font-bold text-slate-900">
                        {contractFilter === "Owned" ? "Fair Market Valuation" : "Fair Market Rent"} Assessment
                      </h2>
                      <p className="text-sm font-semibold text-slate-500 mt-1">
                        Site Identification: <span className="text-slate-800">{sites.find(s => s.id.toString() === selectedSiteId)?.site_code}</span> • Report Date: <span className="text-slate-800">{new Date().toLocaleDateString()}</span>
                      </p>
                    </div>

                    {/* Confidence Rating Block */}
                    {confidenceRating && (
                      <div className={`mb-8 p-5 rounded-xl border flex flex-col sm:flex-row gap-5 items-start sm:items-center ${getConfidenceColors(confidenceRating)}`}>
                        <div className="flex-shrink-0 min-w-[120px]">
                          <span className="text-xs font-bold uppercase tracking-wider block mb-1 opacity-75">Confidence</span>
                          <span className="text-xl font-black">{confidenceRating}</span>
                        </div>
                        <div className="hidden sm:block w-px h-12 bg-current opacity-20"></div>
                        <p className="text-sm font-medium leading-relaxed opacity-90">
                          {confidenceExplanation}
                        </p>
                      </div>
                    )}

                    <div className="prose prose-sm prose-slate max-w-none text-sm leading-relaxed">
                      {formatAssessment(assessment)}
                    </div>
                  </div>
                  
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800 tracking-tight">Owned Sites Valuation History</h3>
          </div>
          <div className="flex-1 overflow-auto max-h-[400px]">
            {ownedHistory.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Site</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Value Estimate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ownedHistory.map((val, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-500 text-xs">{new Date(val.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{val.assets?.site_code}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[150px]">{val.assets?.common_name}</p>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-emerald-700">
                        {val.estimated_value ? `${val.estimated_value.toLocaleString()} ${val.currency}` : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No historical valuations for Owned sites.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800 tracking-tight">Rented/Leased Market Assessments</h3>
          </div>
          <div className="flex-1 overflow-auto max-h-[400px]">
            {rentedHistory.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Site</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Fair Mkt Rent (AI)</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Current Cost</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rentedHistory.map((val, idx) => {
                    const currentCost = val.assets?.annual_cost;
                    const marketPos = getMarketPosition(currentCost, val.estimated_value);
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-500 text-xs">{new Date(val.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-800">{val.assets?.site_code}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[150px]">{val.assets?.common_name}</p>
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-emerald-700">{val.estimated_value ? `${val.estimated_value.toLocaleString()} ${val.currency}` : "N/A"}</td>
                        <td className="px-6 py-4 text-right font-medium text-slate-700">{currentCost ? `${currentCost.toLocaleString()} ${val.currency}` : "N/A"}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider min-w-[100px] ${marketPos.class}`}>
                            {marketPos.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No historical assessments for Rented/Leased sites.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}