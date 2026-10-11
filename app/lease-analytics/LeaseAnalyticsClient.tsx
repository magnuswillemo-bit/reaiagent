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
            file_type: "Lease Agreements", 
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
      
      // Refresh document list so newly uploaded leases appear immediately
      const { data: updatedDocs } = await supabase.from("site_documents").select("*").eq("site_id", selectedSiteId).order("created_at", { ascending: false });
      if (updatedDocs) setSiteDocuments(updatedDocs);
      
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
    
    try {
      const { jsPDF } = await import("jspdf");
      const targetSite = sites.find(s => s.id.toString() === selectedSiteId);
      const siteCode = targetSite?.site_code || "Unknown";
      const dateStr = new Date().toISOString().split("T")[0];

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 16;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 20;
      let y = 0;

      const ensureSpace = (neededHeight: number) => {
        if (y + neededHeight > bottomLimit) {
          doc.addPage();
          y = 20;
        }
      };

      // 1. Top Corporate Header Banner
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 32, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text("LEASE ANALYTICS & RISK REPORT", margin, 14);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Site: ${siteCode} — ${targetSite?.common_name || ""} (${targetSite?.city || ""}, ${targetSite?.country || ""})`,
        margin,
        22
      );
      doc.text(`Generated: ${dateStr}`, pageWidth - margin, 22, { align: "right" });

      y = 42;

      // 2. Executive Summary Heading
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text("Executive Summary", margin, y);
      y += 2;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;

      const renderSummaryBlock = (
        title: string,
        items: string[],
        bgRgb: [number, number, number],
        borderRgb: [number, number, number],
        titleRgb: [number, number, number]
      ) => {
        if (!items || items.length === 0) return;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const wrappedItems = items.map(item =>
          doc.splitTextToSize(item.replace(/\\\$/g, "$"), contentWidth - 14)
        );
        const totalLines = wrappedItems.reduce((acc, lines) => acc + lines.length, 0);
        const boxHeight = 14 + totalLines * 4.5 + items.length * 2;

        ensureSpace(boxHeight);

        doc.setFillColor(...bgRgb);
        doc.setDrawColor(...borderRgb);
        doc.roundedRect(margin, y, contentWidth, boxHeight, 2.5, 2.5, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...titleRgb);
        doc.text(title.toUpperCase(), margin + 5, y + 7);

        let itemY = y + 13;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);

        wrappedItems.forEach(lines => {
          doc.setFont("helvetica", "bold");
          doc.text("•", margin + 5, itemY);
          doc.setFont("helvetica", "normal");
          doc.text(lines, margin + 10, itemY);
          itemY += lines.length * 4.5 + 2;
        });

        y += boxHeight + 5;
      };

      renderSummaryBlock(
        "Contract Strengths",
        activeReport.executive_summary?.strengths || [],
        [240, 253, 244],
        [187, 247, 208],
        [6, 95, 70]
      );

      renderSummaryBlock(
        "Contract Weaknesses",
        activeReport.executive_summary?.weaknesses || [],
        [255, 241, 242],
        [254, 205, 211],
        [159, 18, 57]
      );

      // 3. Pre-Negotiation Playbook (2x2 Clean Grid)
      const playbook = activeReport.executive_summary?.negotiation_playbook;
      if (playbook) {
        const categories = [
          { label: "MUST HAVES", list: playbook.must_haves || [] },
          { label: "THINGS TO REMOVE", list: playbook.things_to_remove || [] },
          { label: "THINGS TO ADD", list: playbook.things_to_add || [] },
          { label: "CONSIDERATIONS", list: playbook.things_to_consider || [] },
        ];

        ensureSpace(25);
        y += 3;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text("Pre-Negotiation Playbook", margin, y);
        y += 2;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5;

        const colGap = 6;
        const colWidth = (contentWidth - colGap) / 2;

        for (let i = 0; i < categories.length; i += 2) {
          const leftCat = categories[i];
          const rightCat = categories[i + 1];

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);

          const leftWrapped = leftCat.list.map((it: string) =>
            doc.splitTextToSize(it.replace(/\\\$/g, "$"), colWidth - 12)
          );
          const rightWrapped = rightCat.list.map((it: string) =>
            doc.splitTextToSize(it.replace(/\\\$/g, "$"), colWidth - 12)
          );

          const leftHeight =
            12 +
            leftWrapped.reduce((a: number, b: string[]) => a + b.length * 4.2 + 2, 0);
          const rightHeight =
            12 +
            rightWrapped.reduce((a: number, b: string[]) => a + b.length * 4.2 + 2, 0);
          const rowHeight = Math.max(leftHeight, rightHeight, 22);

          ensureSpace(rowHeight + 4);

          doc.setFillColor(30, 41, 59);
          doc.roundedRect(margin, y, colWidth, rowHeight, 2, 2, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(147, 197, 253);
          doc.text(leftCat.label, margin + 5, y + 6.5);

          let ly = y + 12;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(241, 245, 249);
          leftWrapped.forEach((lines: string[]) => {
            doc.text("•", margin + 5, ly);
            doc.text(lines, margin + 9, ly);
            ly += lines.length * 4.2 + 2;
          });

          const rightX = margin + colWidth + colGap;
          doc.setFillColor(30, 41, 59);
          doc.roundedRect(rightX, y, colWidth, rowHeight, 2, 2, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(147, 197, 253);
          doc.text(rightCat.label, rightX + 5, y + 6.5);

          let ry = y + 12;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(241, 245, 249);
          rightWrapped.forEach((lines: string[]) => {
            doc.text("•", rightX + 5, ry);
            doc.text(lines, rightX + 9, ry);
            ry += lines.length * 4.2 + 2;
          });

          y += rowHeight + 5;
        }
      }

      // 4. 15-Point Deep Dive Section
      ensureSpace(25);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text("15-Point Clause Deep Dive", margin, y);
      y += 2;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;

      const clauses = activeReport.clause_analysis || [];
      const innerColGap = 6;
      const innerColWidth = (contentWidth - 12 - innerColGap) / 2;

      clauses.forEach((clause: any) => {
        const extractedText = (clause.extracted_terms || "N/A").replace(/\\\$/g, "$");
        const riskText = (clause.risk_analysis || "N/A").replace(/\\\$/g, "$");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.8);
        const extractedLines = doc.splitTextToSize(extractedText, innerColWidth);
        const riskLines = doc.splitTextToSize(riskText, innerColWidth);

        const maxLines = Math.max(extractedLines.length, riskLines.length);
        const cardHeight = 18 + maxLines * 4.3 + 6;

        ensureSpace(cardHeight + 4);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, "FD");

        doc.setFillColor(248, 250, 252);
        doc.rect(margin + 0.3, y + 0.3, contentWidth - 0.6, 10, "F");
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + 10.3, pageWidth - margin, y + 10.3);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${clause.id}. ${clause.title}`, margin + 5, y + 6.8);

        const level = (clause.risk_level || "Info").toUpperCase();
        let pillBg: [number, number, number] = [241, 245, 249];
        let pillFg: [number, number, number] = [71, 85, 105];
        if (level.includes("HIGH")) {
          pillBg = [254, 226, 226];
          pillFg = [153, 27, 27];
        } else if (level.includes("MEDIUM")) {
          pillBg = [254, 243, 199];
          pillFg = [146, 64, 14];
        } else if (level.includes("LOW")) {
          pillBg = [209, 250, 229];
          pillFg = [6, 95, 70];
        }

        const badgeW = 26;
        doc.setFillColor(...pillBg);
        doc.roundedRect(pageWidth - margin - badgeW - 4, y + 2.2, badgeW, 6, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...pillFg);
        doc.text(`${level} RISK`, pageWidth - margin - 4 - badgeW / 2, y + 6.2, {
          align: "center",
        });

        const leftColX = margin + 5;
        const rightColX = margin + 5 + innerColWidth + innerColGap;
        const subHeaderY = y + 15.5;
        const bodyStartY = y + 20.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text("EXTRACTED TERMS", leftColX, subHeaderY);
        doc.text("AI RISK ANALYSIS", rightColX, subHeaderY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.8);
        doc.setTextColor(51, 65, 85);
        doc.text(extractedLines, leftColX, bodyStartY);
        doc.text(riskLines, rightColX, bodyStartY);

        y += cardHeight + 4.5;
      });

      // 5. Add Page Numbers & Footers Across All Pages
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `reAIgent Portfolio Intelligence • ${siteCode} Lease Analytics Report`,
          margin,
          pageHeight - 8.5
        );
        doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8.5, {
          align: "right",
        });
      }

      // 6. Trigger Browser Download & Upload to "Lease Analytics" Bucket in Supabase
      const fileName = `${dateStr}_${siteCode}_LeaseAnalyticsReport.pdf`;
      doc.save(fileName);

      const pdfBlob = doc.output("blob");

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("documents").getPublicUrl(fileName);

      const { error: dbError } = await supabase.from("site_documents").insert([{
        site_id: targetSite?.id || Number(selectedSiteId),
        file_name: fileName,
        file_size: pdfBlob.size,
        file_type: "Lease Analytics",
        file_url: publicUrlData.publicUrl,
        uploaded_by: user?.email || "System"
      }]);

      if (dbError) throw dbError;

      setPdfSuccess(true);

      // Refresh document list so saved report appears immediately
      const { data: updatedDocs } = await supabase.from("site_documents").select("*").eq("site_id", selectedSiteId).order("created_at", { ascending: false });
      if (updatedDocs) setSiteDocuments(updatedDocs);
    } catch (err: any) {
      console.error(err);
      setError(`Failed to save PDF: ${err.message}`);
    } finally {
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
                    <option key={site.id} value={site.id}>{site.site_code} {site.city}</option>
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