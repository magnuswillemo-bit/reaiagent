"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

export default function LeaseAnalyticsClient() {
  const { user } = useAuth();
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  
  const [siteDocuments, setSiteDocuments] = useState<any[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<any>(null);

  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  useEffect(() => {
    const fetchSites = async () => {
      const { data } = await supabase.from("assets").select("*").eq("status", "Operational").eq("contract_type", "Rented/Leased").order("site_code", { ascending: true });
      if (data) setSites(data);
    };
    fetchSites();
  }, []);

  useEffect(() => {
    if (!selectedSiteId) {
      setSiteDocuments([]); 
      setSelectedDocIds([]); 
      setNewFiles([]);
      setActiveReport(null); 
      return;
    }

    const fetchDocsAndReports = async () => {
      const { data: docs } = await supabase.from("site_documents").select("*").eq("site_id", selectedSiteId).order("created_at", { ascending: false });
      if (docs) setSiteDocuments(docs);
      
      const { data: reports } = await supabase.from("lease_analytics").select("*").eq("site_id", selectedSiteId).order("created_at", { ascending: false }).limit(1);
      if (reports && reports.length > 0) {
        setActiveReport(reports[0].analysis_data);
        if (reports[0].document_id) {
          setSelectedDocIds([reports[0].document_id.toString()]);
        }
      } else {
        setActiveReport(null);
      }
    };

    fetchDocsAndReports();
  }, [selectedSiteId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const addedFiles = Array.from(e.target.files);
      setNewFiles(prev => [...prev, ...addedFiles]);
    }
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleExistingDoc = (docId: string) => {
    setSelectedDocIds(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const handleRunAnalytics = async () => {
    if (!selectedSiteId || (selectedDocIds.length === 0 && newFiles.length === 0)) return;

    setIsLoading(true);
    setError(null);
    setActiveReport(null);
    setPdfSuccess(false);

    try {
      let finalDocUrls: string[] = [];
      let primaryDocId = selectedDocIds.length > 0 ? selectedDocIds[0] : null;

      if (selectedDocIds.length > 0) {
        setLoadingStatus("Retrieving selected documents from vault...");
        selectedDocIds.forEach(id => {
          const doc = siteDocuments.find(d => d.id.toString() === id);
          if (doc) finalDocUrls.push(doc.file_url);
        });
      }

      if (newFiles.length > 0) {
        setLoadingStatus(`Uploading ${newFiles.length} new document(s) to secure vault...`);
        for (const file of newFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${selectedSiteId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file);
          if (uploadError) throw uploadError;
          
          const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(fileName);
          finalDocUrls.push(publicUrlData.publicUrl);

          const { data: insertedDoc, error: dbError } = await supabase.from('site_documents').insert([{
            site_id: Number(selectedSiteId), 
            file_name: file.name, 
            file_size: file.size,
            file_type: file.type || 'unknown', 
            file_url: publicUrlData.publicUrl, 
            uploaded_by: user?.email || "System"
          }]).select();

          if (dbError) throw dbError;
          
          if (!primaryDocId && insertedDoc) {
             primaryDocId = insertedDoc[0].id;
          }
        }
      }

      setLoadingStatus("AI Engine extracting 15 key clauses from all documents...");
      const aiFormData = new FormData();
      finalDocUrls.forEach(url => aiFormData.append("fileUrls[]", url));

      const res = await fetch("/api/lease-analytics", { method: "POST", body: aiFormData });
      const aiData = await res.json();
      if (!res.ok) throw new Error(aiData.error || "AI processing failed.");

      setLoadingStatus("Saving analytics to master database...");
      
      const savePayload = {
        site_id: Number(selectedSiteId),
        document_id: primaryDocId, 
        analysis_data: aiData.data
      };

      const { error: saveError } = await supabase.from("lease_analytics").insert([savePayload]);

      if (saveError) {
         throw new Error(saveError.message || "Database rejected the payload structure.");
      }

      setActiveReport(aiData.data);
      setNewFiles([]);
      
    } catch (err: any) {
      setError(`Error: ${err.message}. Please try again.`);
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  const handleSavePdf = async () => {
    if (!selectedSiteId || !activeReport) return;
    setIsSavingPdf(true);
    setError(null);

    // CSS Interceptor to prevent SecurityErrors from Browser Extensions (e.g. Grammarly, AdBlockers)
    const originalCssRules = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules');
    if (originalCssRules) {
      Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
        get() {
          try {
            return originalCssRules.get?.call(this) || [];
          } catch (e) {
            return []; // Fail gracefully instead of crashing
          }
        },
        configurable: true
      });
    }
    
    try {
      const { toJpeg } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');

      const reportElement = document.getElementById("analytics-report-content");
      if (!reportElement) throw new Error("Report content not found");

      const originalPadding = reportElement.style.padding;
      reportElement.style.padding = "24px";
      
      // Use JPEG with lower pixelRatio to prevent Massive File Size limits in Supabase
      const imgData = await toJpeg(reportElement, { 
        quality: 0.85,
        pixelRatio: 1.5,
        backgroundColor: '#ffffff'
      });
      
      reportElement.style.padding = originalPadding; 

      const pdf = new jsPDF("p", "mm", "a4");
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add compressed JPEG image to PDF
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      const pdfBlob = pdf.output("blob");
      
      const targetSite = sites.find(s => s.id.toString() === selectedSiteId);
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `${dateStr}_${targetSite?.site_code || 'Unknown'}_LeaseAnalyticsReport.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('site_documents').insert([{
        site_id: targetSite?.id || Number(selectedSiteId),
        file_name: fileName,
        file_size: pdfBlob.size,
        file_type: 'application/pdf',
        file_url: publicUrlData.publicUrl,
        uploaded_by: user?.email || "System"
      }]);

      if (dbError) throw dbError;

      setPdfSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(`Failed to save PDF: ${err.message}`);
    } finally {
      // Restore standard CSS Rules to the browser
      if (originalCssRules) {
        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', originalCssRules);
      }
      setIsSavingPdf(false);
    }
  };

  const getRiskBadge = (level: string) => {
    switch(level?.toLowerCase()) {
      case 'high': return <span className="bg-rose-100 text-rose-800 border-rose-200 border px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">High Risk</span>;
      case 'medium': return <span className="bg-amber-100 text-amber-800 border-amber-200 border px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">Medium Risk</span>;
      case 'low': return <span className="bg-emerald-100 text-emerald-800 border-emerald-200 border px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">Low Risk</span>;
      default: return <span className="bg-slate-100 text-slate-600 border-slate-200 border px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">Info</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-2 border-b border-slate-200 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">Lease Analytics</h2>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Column: Control Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 sticky top-8">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-6 border-b border-slate-100 pb-3">Document Selector</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">1. Select Leased Site</label>
                <select 
                  value={selectedSiteId} 
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-3 outline-none cursor-pointer"
                >
                  <option value="">-- Choose Target Site --</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.site_code} - {site.city}</option>
                  ))}
                </select>
              </div>

              <div className={`transition-opacity duration-300 ${!selectedSiteId ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <label className="block text-xs font-semibold text-slate-500 mb-3 uppercase">2. Select Appendices & Leases</label>
                
                {siteDocuments.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                    {siteDocuments.map(doc => (
                      <label key={doc.id} className="flex items-start space-x-3 cursor-pointer hover:bg-slate-100 p-2 rounded transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedDocIds.includes(doc.id.toString())}
                          onChange={() => toggleExistingDoc(doc.id.toString())}
                          className="mt-1 border-slate-300 text-blue-600 focus:ring-blue-500 rounded cursor-pointer" 
                        />
                        <span className="text-sm text-slate-700 font-medium break-all leading-tight">{doc.file_name}</span>
                      </label>
                    ))}
                  </div>
                )}

                {newFiles.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {newFiles.map((file, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-blue-50/50 border border-blue-100 p-2.5 rounded-lg">
                        <span className="text-xs font-semibold text-blue-800 truncate" title={file.name}>{file.name}</span>
                        <button type="button" onClick={() => removeNewFile(idx)} className="text-blue-400 hover:text-rose-500 ml-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div 
                  className="border-2 border-dashed border-blue-200 bg-white rounded-xl p-4 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="text-xl mb-1">➕</div>
                  <p className="text-xs font-bold text-slate-700">Add Documents</p>
                  <input type="file" multiple ref={fileInputRef} className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileSelect} />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={handleRunAnalytics}
                  disabled={!selectedSiteId || (selectedDocIds.length === 0 && newFiles.length === 0) || isLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    <><span className="text-lg leading-none">✨</span> Analyze Lease</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Analytics Report Output */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
            
            <div className="flex-1 p-8">
              {!activeReport && !isLoading && !error && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60 min-h-[400px]">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 border border-slate-200">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <p className="text-slate-600 font-semibold">Ready for Analysis</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-md">Select a site and the relevant documents (main agreements and appendices) to run the extraction and negotiation strategy AI.</p>
                </div>
              )}

              {isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center min-h-[400px]">
                  <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-800 font-bold mb-1">Generating Intelligence Report</p>
                  <p className="text-sm text-blue-600 font-medium">{loadingStatus}</p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium">
                  {error}
                </div>
              )}

              {activeReport && !isLoading && (
                <div id="analytics-report-content" className="space-y-10 animate-in fade-in duration-500 bg-white">
                  
                  {/* Clean PDF Document Header */}
                  <div className="border-b border-slate-200 pb-4 hidden print:block">
                     <h2 className="text-2xl font-bold text-slate-900">Lease Analytics Report</h2>
                     <p className="text-sm font-semibold text-slate-500 mt-1">
                        Site Code: <span className="text-slate-800">{sites.find(s => s.id.toString() === selectedSiteId)?.site_code}</span> | Generated: <span className="text-slate-800">{new Date().toLocaleDateString()}</span>
                     </p>
                  </div>

                  {/* Executive Summary & Header Section */}
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-2 gap-4">
                      <h4 className="text-2xl font-black text-slate-900">Executive Summary</h4>
                      <button 
                        onClick={handleSavePdf}
                        disabled={isSavingPdf || pdfSuccess}
                        className={`px-4 py-2 text-sm font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 ${
                          pdfSuccess ? "bg-slate-800 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {pdfSuccess ? (
                          <><span>✓</span> Saved</>
                        ) : isSavingPdf ? (
                          <><div className="w-3 h-3 border-2 border-slate-700/30 border-t-slate-700 rounded-full animate-spin"></div> Saving...</>
                        ) : (
                          <><span>📄</span> Save Report (PDF)</>
                        )}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-6">
                        <h5 className="text-emerald-800 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><span>✓</span> Contract Strengths</h5>
                        <ul className="space-y-2">
                          {activeReport.executive_summary?.strengths?.map((item: string, i: number) => (
                            <li key={i} className="text-sm text-emerald-900 leading-relaxed">{item}</li>
                          ))}
                        </ul>
                      </div>
                      
                      <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-6">
                        <h5 className="text-rose-800 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><span>⚠️</span> Contract Weaknesses</h5>
                        <ul className="space-y-2">
                          {activeReport.executive_summary?.weaknesses?.map((item: string, i: number) => (
                            <li key={i} className="text-sm text-rose-900 leading-relaxed">{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Pre-Negotiation Playbook */}
                    <div className="bg-slate-800 rounded-xl p-6 text-white shadow-md">
                      <h5 className="font-bold text-sm uppercase tracking-wider mb-6 text-blue-300 flex items-center gap-2"><span>🎯</span> Pre-Negotiation Playbook</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Must Haves</p>
                          <ul className="space-y-2">
                            {activeReport.executive_summary?.negotiation_playbook?.must_haves?.map((item: string, i: number) => (
                              <li key={i} className="text-sm text-slate-100">{item}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Things to Remove</p>
                          <ul className="space-y-2">
                            {activeReport.executive_summary?.negotiation_playbook?.things_to_remove?.map((item: string, i: number) => (
                              <li key={i} className="text-sm text-slate-100">{item}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Things to Add</p>
                          <ul className="space-y-2">
                            {activeReport.executive_summary?.negotiation_playbook?.things_to_add?.map((item: string, i: number) => (
                              <li key={i} className="text-sm text-slate-100">{item}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Considerations</p>
                          <ul className="space-y-2">
                            {activeReport.executive_summary?.negotiation_playbook?.things_to_consider?.map((item: string, i: number) => (
                              <li key={i} className="text-sm text-slate-100">{item}</li>
                            ))}
                          </ul>
                        </div>
                        
                      </div>
                    </div>
                  </div>

                  {/* 15-Point Deep Dive Grid */}
                  <div className="space-y-6">
                    <h4 className="text-2xl font-black text-slate-900 border-b border-slate-200 pb-2 mt-12">15-Point Deep Dive</h4>
                    
                    <div className="grid grid-cols-1 gap-6">
                      {activeReport.clause_analysis?.map((clause: any, index: number) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h5 className="font-bold text-slate-800">{clause.id}. {clause.title}</h5>
                            {getRiskBadge(clause.risk_level)}
                          </div>
                          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Extracted Terms</p>
                              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                                {clause.extracted_terms}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">AI Risk Analysis</p>
                              <p className="text-sm text-slate-700 leading-relaxed bg-blue-50/30 p-4 rounded-lg border border-blue-100">
                                {clause.risk_analysis}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}