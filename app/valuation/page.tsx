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

  const stripConfidenceMeta = (text: string) => {
    return (text || "").replace(/^<!--CONFIDENCE:(.*?)-->\n?/, "");
  };

  const extractHistoricalConfidence = (val: any): string => {
    if (val?.confidence_rating) return val.confidence_rating;
    const raw = val?.assessment || "";
    const metaMatch = raw.match(/^<!--CONFIDENCE:(.*?)-->/);
    if (metaMatch && metaMatch[1]) return metaMatch[1].trim();
    return "N/A";
  };

  const cleanMarkdownText = (str: string) => {
    return stripConfidenceMeta(str)
      .replace(/\\\$/g, "$")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .trim();
  };

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

      // Embed confidence metadata prefix so history tables always display it without requiring DB schema migrations
      const storedAssessment = data.confidence_rating
        ? `<!--CONFIDENCE:${data.confidence_rating}-->\n${data.assessment || ""}`
        : data.assessment;

      const { error: insertError } = await supabase.from("valuations").insert([{
        site_id: targetSite.id,
        contract_type: contractFilter,
        assessment: storedAssessment,
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
      const { jsPDF } = await import("jspdf");
      const targetSite = sites.find(s => s.id.toString() === selectedSiteId);
      if (!targetSite) throw new Error("Target site not found");

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 20;
      let y = 0;

      const ensureSpace = (neededHeight: number) => {
        if (y + neededHeight > bottomLimit) {
          doc.addPage();
          y = 22;
        }
      };

      // 1. Top Corporate Header Banner
      doc.setFillColor(15, 23, 42); // Slate-900
      doc.rect(0, 0, pageWidth, 34, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      const reportTitle = contractFilter === "Owned"
        ? "FAIR MARKET VALUATION REPORT"
        : "FAIR MARKET RENT ASSESSMENT";
      doc.text(reportTitle, margin, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184); // Slate-400
      const dateFormatted = new Date().toISOString().split("T")[0];
      doc.text(
        `Site: ${targetSite.site_code} — ${targetSite.common_name || ""} (${targetSite.city || ""}, ${targetSite.country || ""})`,
        margin,
        23
      );
      doc.text(`Report Date: ${dateFormatted}`, pageWidth - margin, 23, { align: "right" });

      y = 44;

      // 2. Key Valuation & Confidence Summary Box
      const currency = targetSite.local_currency || "USD";
      const valLabel = contractFilter === "Owned" ? "ESTIMATED CAPITAL VALUE" : "ESTIMATED ANNUAL FAIR MARKET RENT";
      const valFormatted = estimatedValue ? `${estimatedValue.toLocaleString()} ${currency}` : "N/A";

      const confExplanationText = cleanMarkdownText(confidenceExplanation || "");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const confLines = doc.splitTextToSize(confExplanationText, contentWidth - 12);
      const summaryBoxHeight = Math.max(32, 24 + confLines.length * 4.5);

      doc.setFillColor(248, 250, 252); // Slate-50
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.roundedRect(margin, y, contentWidth, summaryBoxHeight, 3, 3, "FD");

      // Estimated Value (Left)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(valLabel, margin + 6, y + 8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text(valFormatted, margin + 6, y + 16);

      // Confidence Pill (Right)
      if (confidenceRating) {
        const ratingUpper = confidenceRating.toUpperCase();
        let badgeBg: [number, number, number] = [226, 232, 240];
        let badgeText: [number, number, number] = [51, 65, 85];
        if (ratingUpper === "HIGH") {
          badgeBg = [209, 250, 229];
          badgeText = [6, 95, 70];
        } else if (ratingUpper === "MEDIUM") {
          badgeBg = [254, 243, 199];
          badgeText = [146, 64, 14];
        } else if (ratingUpper === "LOW") {
          badgeBg = [254, 226, 226];
          badgeText = [153, 27, 27];
        }

        const pillWidth = 42;
        doc.setFillColor(...badgeBg);
        doc.roundedRect(pageWidth - margin - pillWidth - 6, y + 5, pillWidth, 8, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...badgeText);
        doc.text(
          `CONFIDENCE: ${ratingUpper}`,
          pageWidth - margin - 6 - pillWidth / 2,
          y + 10.3,
          { align: "center" }
        );
      }

      // Confidence Explanation
      if (confLines.length > 0) {
        doc.setDrawColor(226, 232, 240);
        doc.line(margin + 6, y + 20, pageWidth - margin - 6, y + 20);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(confLines, margin + 6, y + 25.5);
      }

      y += summaryBoxHeight + 10;

      // 3. Render Assessment Sections Cleanly
      const lines = stripConfidenceMeta(assessment).split("\n");

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          y += 2;
          continue;
        }

        // Section Heading (## or ###)
        if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
          const headingText = cleanMarkdownText(trimmed.replace(/^#+\s*/, ""));
          ensureSpace(14);
          y += 4;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(15, 23, 42);
          doc.text(headingText, margin, y);
          y += 2;
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, y, pageWidth - margin, y);
          y += 6;
          continue;
        }

        // Bullet Points (* or - or numbered 1.)
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || /^\d+\.\s/.test(trimmed)) {
          const isNumbered = /^\d+\.\s/.test(trimmed);
          const prefix = isNumbered ? trimmed.match(/^\d+\./)?.[0] || "•" : "•";
          const bodyContent = isNumbered
            ? trimmed.replace(/^\d+\.\s*/, "")
            : trimmed.substring(2);

          const cleanedBullet = cleanMarkdownText(bodyContent);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          const wrappedBullet = doc.splitTextToSize(cleanedBullet, contentWidth - 8);
          const blockHeight = wrappedBullet.length * 4.8 + 1.5;

          ensureSpace(blockHeight);

          doc.setFont("helvetica", "bold");
          doc.setTextColor(37, 99, 235); // Blue accent bullet
          doc.text(prefix, margin + 1, y);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(wrappedBullet, margin + 7, y);
          y += blockHeight;
          continue;
        }

        // Regular Paragraph
        const cleanedPara = cleanMarkdownText(trimmed);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        const wrappedPara = doc.splitTextToSize(cleanedPara, contentWidth);
        const paraHeight = wrappedPara.length * 4.8 + 2.5;

        ensureSpace(paraHeight);
        doc.text(wrappedPara, margin, y);
        y += paraHeight;
      }

      // 4. Add Footers & Page Numbers to All Pages
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `reAIgent Portfolio Intelligence • ${targetSite.site_code} Valuation Report`,
          margin,
          pageHeight - 9
        );
        doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 9, {
          align: "right",
        });
      }

      // 5. Determine Naming Convention, Trigger Download & Upload to Supabase
      const reportType = contractFilter === "Owned" ? "FMV" : "FMR";
      const fileName = `${dateFormatted}_${targetSite.site_code}_${reportType}_Report.pdf`;

      doc.save(fileName);

      const pdfBlob = doc.output("blob");

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("documents").getPublicUrl(fileName);

      const { error: dbError } = await supabase.from("site_documents").insert([{
        site_id: targetSite.id,
        file_name: fileName,
        file_size: pdfBlob.size,
        file_type: "application/pdf",
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
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const formatAssessment = (text: string) => {
    return stripConfidenceMeta(text).split('\n').map((line, i) => {
      const cleanLine = line.replace(/\\\$/g, '$');
      if (cleanLine.startsWith('## ')) return <h3 key={i} className="text-lg font-bold text-slate-900 mt-6 mb-2">{cleanLine.replace('## ', '')}</h3>;
      if (cleanLine.startsWith('**') && cleanLine.includes('**:')) return <p key={i} className="mb-2"><strong className="text-slate-800">{cleanLine.split('**:')[0].replace(/\*\*/g, '')}:</strong>{cleanLine.split('**:')[1].replace(/\*\*/g, '')}</p>;
      if (cleanLine.startsWith('* ') || cleanLine.startsWith('- ')) return <li key={i} className="ml-4 mb-1 text-slate-700">{cleanLine.substring(2).replace(/\*\*/g, '')}</li>;
      if (cleanLine.trim() === '') return <br key={i} />;
      return <p key={i} className="mb-2 text-slate-700">{cleanLine.replace(/\*\*/g, '')}</p>;
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
                  
                  <div id="valuation-report-content" className="bg-white rounded-lg pt-2 pb-6 px-1">
                    <div className="mb-8 pb-4 border-b border-slate-200">
                      <h2 className="text-2xl font-bold text-slate-900">
                        {contractFilter === "Owned" ? "Fair Market Valuation" : "Fair Market Rent"} Assessment
                      </h2>
                      <p className="text-sm font-semibold text-slate-500 mt-1">
                        Site Identification: <span className="text-slate-800 mr-4">{sites.find(s => s.id.toString() === selectedSiteId)?.site_code}</span>
                        Report Date: <span className="text-slate-800">{new Date().toLocaleDateString()}</span>
                      </p>
                    </div>

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

      {/* Bottom History Tables — Zero Horizontal Scroll, Vertical Scroll Enabled */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
        
        {/* Owned Sites Valuation History */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800 tracking-tight text-sm">Owned Sites Valuation History</h3>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden max-h-[400px]">
            {ownedHistory.length > 0 ? (
              <table className="w-full text-left table-auto">
                <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                  <tr>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Site</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Value Estimate</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {ownedHistory.map((val, idx) => {
                    const conf = extractHistoricalConfidence(val);
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                          {new Date(val.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-3 py-3 max-w-[140px]">
                          <p className="font-bold text-slate-800 text-xs leading-tight">{val.assets?.site_code}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={val.assets?.common_name}>
                            {val.assets?.common_name}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700 text-xs whitespace-nowrap">
                          {val.estimated_value ? `${val.estimated_value.toLocaleString()} ${val.currency}` : "N/A"}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border min-w-[60px] ${getConfidenceColors(conf)}`}>
                            {conf}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No historical valuations for Owned sites.</div>
            )}
          </div>
        </div>

        {/* Rented/Leased Market Assessments */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800 tracking-tight text-sm">Rented/Leased Market Assessments</h3>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden max-h-[400px]">
            {rentedHistory.length > 0 ? (
              <table className="w-full text-left table-auto">
                <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                  <tr>
                    <th className="px-2.5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-2.5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Site</th>
                    <th className="px-2.5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Fair Rent (AI)</th>
                    <th className="px-2.5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Current Cost</th>
                    <th className="px-2.5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                    <th className="px-2.5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {rentedHistory.map((val, idx) => {
                    const currentCost = val.assets?.annual_cost;
                    const marketPos = getMarketPosition(currentCost, val.estimated_value);
                    const conf = extractHistoricalConfidence(val);
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-2.5 py-3 text-slate-500 text-[10px] whitespace-nowrap">
                          {new Date(val.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-2.5 py-3 max-w-[105px]">
                          <p className="font-bold text-slate-800 text-[11px] leading-tight">{val.assets?.site_code}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate" title={val.assets?.common_name}>
                            {val.assets?.common_name}
                          </p>
                        </td>
                        <td className="px-2.5 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {val.estimated_value ? `${val.estimated_value.toLocaleString()} ${val.currency}` : "N/A"}
                        </td>
                        <td className="px-2.5 py-3 text-right font-medium text-slate-700 whitespace-nowrap">
                          {currentCost ? `${currentCost.toLocaleString()} ${val.currency}` : "N/A"}
                        </td>
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider min-w-[74px] ${marketPos.class}`}>
                            {marketPos.label}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border min-w-[54px] ${getConfidenceColors(conf)}`}>
                            {conf}
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