"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

type ViewState = "list" | "new" | "detail" | "edit";
type ManualDocBucket = "Lease Agreements" | "Other";
type DocBucket = "Lease Agreements" | "Valuations" | "Lease Analytics" | "Other";

const DOC_BUCKETS: { key: DocBucket; icon: string; badgeClass: string }[] = [
  { key: "Lease Agreements", icon: "📜", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "Valuations", icon: "💰", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "Lease Analytics", icon: "📊", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "Other", icon: "📁", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" },
];

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

const DIVISIONS = ["AM", "ALS", "GTS", "ELS", "IE", "MS", "PS", "RD", "Local Offices"];
const ACTIVITIES = ["Office", "Plant", "Plant On/In-site", "Warehouse", "Warehouse - 3rd Party", "Land", "Other"];

export default function DatabaseClient() {
  const { user, role } = useAuth();
  const canEdit = role === "SuperUser" || role === "Admin";
  const currentUser = user?.email || "System";

  const [view, setView] = useState<ViewState>("list");
  const [activeTab, setActiveTab] = useState("manual");
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState<any>(null);
  
  const [siteLogs, setSiteLogs] = useState<any[]>([]);
  const [siteDocuments, setSiteDocuments] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; category: ManualDocBucket }[]>([]);
  const [selectedUploadBucket, setSelectedUploadBucket] = useState<ManualDocBucket>("Lease Agreements");
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ status: "", contract_type: "", country: "" });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState("Uploading document to Gemini AI...");

  const [isDivOpen, setIsDivOpen] = useState(false);
  const divDropdownRef = useRef<HTMLDivElement>(null);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableContentRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(1000);

  const emptyForm = {
    site_code: "", common_name: "", divisional_belonging: "", legal_entity: "",
    jv_status: "No", status: "Operational", activity_type: "", country: "", state: "", 
    city: "", zip_code: "", street_address: "", latitude: "", longitude: "", sqm_land: "",
    sqm_building: "", contract_type: "Rented/Leased", leaseholder: "", lease_owner: "", lease_start: "",
    lease_end: "", annual_cost: "", local_currency: "USD",
    ai_fair_market_value: "", ai_fair_market_rent: "", ai_valuation_date: ""
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => { if (view === "list") fetchSites(); }, [view]);

  useEffect(() => {
    if (view === "list" && tableContentRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setTableWidth(entry.contentRect.width);
        }
      });
      observer.observe(tableContentRef.current);
      return () => observer.disconnect();
    }
  }, [view, sites, searchQuery, filters]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (divDropdownRef.current && !divDropdownRef.current.contains(event.target as Node)) {
        setIsDivOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resolveDocBucket = (doc: any): DocBucket => {
    const rawType = (doc?.file_type || "").trim();
    if (
      rawType === "Lease Agreements" ||
      rawType === "Valuations" ||
      rawType === "Lease Analytics" ||
      rawType === "Other"
    ) {
      return rawType as DocBucket;
    }

    const name = (doc?.file_name || "").toLowerCase();
    if (name.includes("leaseanalyticsreport") || name.includes("lease_analytics")) {
      return "Lease Analytics";
    }
    if (name.includes("_fmv_report") || name.includes("_fmr_report") || name.includes("valuation")) {
      return "Valuations";
    }
    if (name.includes("lease") || name.includes("contract") || name.includes("agreement") || name.includes("addendum") || name.includes("appendix")) {
      return "Lease Agreements";
    }
    return "Other";
  };

  const fetchSites = async () => {
    const { data } = await supabase.from("assets").select("*").order("site_code", { ascending: true });
    if (data) {
      const normalizedData = data.map(site => {
        const rawStatus = (site.status || "Operational").trim();
        const lowerStatus = rawStatus.toLowerCase();
        let cleanStatus = "Operational";
        if (lowerStatus.includes("sold") || lowerStatus.includes("exit") || lowerStatus.includes("close")) cleanStatus = "Exited/Sold/Closed";
        else if (lowerStatus.includes("not in op")) cleanStatus = "Not in Operation";
        return {
          ...site,
          status: cleanStatus,
          contract_type: (site.contract_type || "").trim().toLowerCase() === "owned" ? "Owned" : "Rented/Leased"
        };
      });
      setSites(normalizedData);
    }
  };

  const fetchSiteLogs = async (siteId: number) => {
    const { data } = await supabase.from("site_logs").select("*").eq("site_id", siteId).order("created_at", { ascending: false });
    if (data) setSiteLogs(data);
  };

  const fetchSiteDocuments = async (siteId: number) => {
    const { data } = await supabase.from("site_documents").select("*").eq("site_id", siteId).order("created_at", { ascending: false });
    if (data) setSiteDocuments(data);
  };

  useEffect(() => {
    if (sites.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      if (id) {
        const targetSite = sites.find(a => a.id.toString() === id);
        if (targetSite) {
          handleRowClick(targetSite);
          window.history.replaceState(null, '', '/database'); 
        }
      }
    }
  }, [sites]);

  const handleRowClick = (site: any) => {
    setSelectedSite(site);
    setFormData({
      site_code: site.site_code || "", common_name: site.common_name || "",
      divisional_belonging: site.divisional_belonging || "", legal_entity: site.legal_entity || "",
      jv_status: site.jv_status || "No", status: site.status || "Operational", activity_type: site.activity_type || "", 
      country: site.country || "", state: site.state || "", city: site.city || "", zip_code: site.zip_code || "", 
      street_address: site.street_address || "", latitude: site.latitude ? String(site.latitude) : "", 
      longitude: site.longitude ? String(site.longitude) : "", sqm_land: site.sqm_land ? String(site.sqm_land) : "", 
      sqm_building: site.sqm_building ? String(site.sqm_building) : "", contract_type: site.contract_type || "Rented/Leased",
      leaseholder: site.leaseholder || "", lease_owner: site.lease_owner || "", lease_start: site.lease_start || "",
      lease_end: site.lease_end || "", annual_cost: site.annual_cost ? String(site.annual_cost) : "", local_currency: site.local_currency || "USD",
      ai_fair_market_value: site.ai_fair_market_value ? String(site.ai_fair_market_value) : "",
      ai_fair_market_rent: site.ai_fair_market_rent ? String(site.ai_fair_market_rent) : "",
      ai_valuation_date: site.ai_valuation_date || ""
    });
    setEditingId(site.id);
    setPendingFiles([]);
    setSelectedUploadBucket("Lease Agreements");
    fetchSiteLogs(site.id);
    fetchSiteDocuments(site.id);
    setView("detail");
    setMessage(null);
  };

  const handleDelete = async () => {
    if (!selectedSite || !editingId) return;
    const confirmDelete = window.confirm(`WARNING: Are you sure you want to permanently delete ${selectedSite.site_code}?`);
    if (confirmDelete) {
      const { error } = await supabase.from("assets").delete().eq("id", editingId);
      if (error) setMessage({ type: "error", text: error.message });
      else { fetchSites(); setView("list"); }
    }
  };

  const handleDeleteExistingDocument = async (doc: any) => {
    const confirmRemove = window.confirm(`Are you sure you want to permanently delete "${doc.file_name}"?`);
    if (!confirmRemove) return;

    setDeletingDocId(doc.id);
    setMessage(null);

    try {
      if (doc.file_url && doc.file_url.includes("/documents/")) {
        const storagePath = decodeURIComponent(doc.file_url.split("/documents/")[1]);
        if (storagePath) {
          await supabase.storage.from("documents").remove([storagePath]);
        }
      }

      await supabase.from("lease_analytics").update({ document_id: null }).eq("document_id", doc.id);

      const { error: dbError } = await supabase.from("site_documents").delete().eq("id", doc.id);
      if (dbError) throw dbError;

      setSiteDocuments(prev => prev.filter(d => d.id !== doc.id));

      if (editingId) {
        await supabase.from("site_logs").insert([{
          site_id: editingId,
          user_name: currentUser,
          description: `Removed document (${resolveDocBucket(doc)}): ${doc.file_name}`
        }]);
        fetchSiteLogs(editingId);
      }

      setMessage({ type: "success", text: `Document "${doc.file_name}" deleted.` });
    } catch (err: any) {
      console.error("Failed to delete document:", err);
      setMessage({ type: "error", text: `Failed to delete document: ${err.message}` });
    } finally {
      setDeletingDocId(null);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Operational": return "bg-emerald-50 text-emerald-700 border border-emerald-200";
      case "Not in Operation": return "bg-amber-50 text-amber-700 border border-amber-200";
      case "Exited/Sold/Closed": return "bg-slate-100 text-slate-700 border border-slate-300";
      default: return "bg-slate-50 text-slate-700 border border-slate-200";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "contract_type" && value === "Owned") {
        next.lease_start = ""; next.lease_end = ""; next.annual_cost = ""; next.local_currency = ""; next.leaseholder = ""; next.lease_owner = "";
      }
      return next;
    });
  };

  const handleDivisionToggle = (div: string) => {
    let currentArr = formData.divisional_belonging ? formData.divisional_belonging.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (currentArr.includes(div)) currentArr = currentArr.filter(d => d !== div);
    else currentArr.push(div);
    setFormData(prev => ({ ...prev, divisional_belonging: currentArr.join(", ") }));
  };

  const handleTopScroll = () => { if (tableScrollRef.current && topScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft; };
  const handleTableScroll = () => { if (tableScrollRef.current && topScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft; };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        category: selectedUploadBucket
      }));
      setPendingFiles(prev => [...prev, ...newFiles]);
      e.target.value = "";
    }
  };

  const updatePendingFileCategory = (index: number, newCategory: ManualDocBucket) => {
    setPendingFiles(prev =>
      prev.map((item, idx) => (idx === index ? { ...item, category: newCategory } : item))
    );
  };
  
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadDocuments = async (siteId: number) => {
    if (pendingFiles.length === 0) return 0;
    
    let successCount = 0;
    for (const item of pendingFiles) {
      const { file, category } = item;
      const fileExt = file.name.split('.').pop();
      const fileName = `${siteId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage.from('documents').upload(fileName, file);
      
      if (uploadData && !uploadError) {
        const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(fileName);
        
        await supabase.from('site_documents').insert([{
          site_id: siteId,
          file_name: file.name,
          file_size: file.size,
          file_type: category,
          file_url: publicUrlData.publicUrl,
          uploaded_by: currentUser
        }]);
        successCount++;
      } else {
         console.error("Storage upload error:", uploadError);
      }
    }
    return successCount;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const payload: any = {
      site_code: formData.site_code, common_name: formData.common_name, divisional_belonging: formData.divisional_belonging,
      legal_entity: formData.legal_entity, jv_status: formData.jv_status, status: formData.status, activity_type: formData.activity_type, 
      country: formData.country, state: formData.state || null, city: formData.city, zip_code: formData.zip_code, street_address: formData.street_address,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null, longitude: formData.longitude ? parseFloat(formData.longitude) : null, 
      sqm_land: formData.sqm_land ? parseFloat(formData.sqm_land) : null, sqm_building: formData.sqm_building ? parseFloat(formData.sqm_building) : null, 
      contract_type: formData.contract_type, leaseholder: formData.leaseholder, lease_owner: formData.lease_owner, 
      lease_start: formData.lease_start || null, lease_end: formData.lease_end || null, 
      annual_cost: formData.annual_cost ? parseFloat(formData.annual_cost) : null, local_currency: formData.local_currency,
    };

    let activeSiteId = editingId;

    if (view === "edit" && activeSiteId) {
      const { error } = await supabase.from("assets").update(payload).eq("id", activeSiteId);
      if (error) { 
        setMessage({ type: "error", text: error.message }); 
        setIsSubmitting(false);
        return;
      } 
      
      let changeDetails: string[] = [];
      Object.keys(payload).forEach(key => {
        const oldVal = (selectedSite[key] ?? "").toString().trim();
        const newVal = (payload[key] ?? "").toString().trim();
        if (oldVal !== newVal) changeDetails.push(`${key.replace(/_/g, " ")}: [${oldVal || 'None'} → ${newVal || 'None'}]`);
      });
      
      let logDescription = changeDetails.length > 0 ? `Updated: ${changeDetails.join(" | ")}` : "Saved without specific field modifications.";

      const docsUploaded = await uploadDocuments(activeSiteId);
      if (docsUploaded > 0) logDescription += ` | Uploaded ${docsUploaded} new document(s).`;

      await supabase.from("site_logs").insert([{ site_id: activeSiteId, user_name: currentUser, description: logDescription }]);
      
      setMessage({ type: "success", text: "Site updated successfully!" });
      setTimeout(() => { fetchSites(); setView("list"); }, 1500);
      
    } else {
      const { data: newSite, error } = await supabase.from("assets").insert([payload]).select();
      if (error) { 
        setMessage({ type: "error", text: error.message }); 
        setIsSubmitting(false);
        return;
      } 
      if (newSite && newSite.length > 0) {
        activeSiteId = newSite[0].id;
        const docsUploaded = await uploadDocuments(activeSiteId!);
        
        let logDescription = "Initial site profile created with code " + payload.site_code + ".";
        if (docsUploaded > 0) logDescription += ` | Uploaded ${docsUploaded} initial document(s).`;

        await supabase.from("site_logs").insert([{ site_id: activeSiteId, user_name: currentUser, description: logDescription }]);

        setMessage({ type: "success", text: "Site created successfully!" });
        setFormData(emptyForm);
        setPendingFiles([]);
        setTimeout(() => { fetchSites(); setView("list"); }, 1500);
      }
    }
    setIsSubmitting(false);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext || '')) return "📄";
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return "📊";
    if (['doc', 'docx'].includes(ext || '')) return "📝";
    if (['ppt', 'pptx'].includes(ext || '')) return "📽️";
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return "🖼️";
    return "📁";
  };

  const handleDocumentScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanStatusText("Uploading document to Gemini AI...");
    setMessage(null);

    try {
      const dataPayload = new FormData();
      dataPayload.append("file", file);

      const res = await fetch("/api/scan-lease", { method: "POST", body: dataPayload });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to scan document");

      const ext = result.data;
      const cleanContractType = (ext.contract_type || "").trim().toLowerCase() === "owned" ? "Owned" : "Rented/Leased";
      
      const rawStatus = (ext.status || "Operational").trim().toLowerCase();
      let cleanStatus = "Operational";
      if (rawStatus.includes("sold") || rawStatus.includes("exit") || rawStatus.includes("close")) cleanStatus = "Exited/Sold/Closed";
      else if (rawStatus.includes("not in op")) cleanStatus = "Not in Operation";

      setFormData({
        site_code: ext.site_code || `AI-${Math.floor(Math.random() * 1000)}`,
        common_name: ext.common_name || "Extracted Site",
        activity_type: ext.activity_type || "",
        divisional_belonging: ext.divisional_belonging || "",
        legal_entity: ext.legal_entity || "Unknown Entity",
        status: cleanStatus,
        jv_status: ext.jv_status || "No",
        country: ext.country || "", state: ext.state || "", city: ext.city || "", zip_code: ext.zip_code || "", street_address: ext.street_address || "",
        latitude: ext.latitude ? String(ext.latitude) : "", longitude: ext.longitude ? String(ext.longitude) : "",
        sqm_land: ext.sqm_land ? String(ext.sqm_land) : "", sqm_building: ext.sqm_building ? String(ext.sqm_building) : "",
        contract_type: cleanContractType, leaseholder: ext.leaseholder || "", lease_owner: ext.lease_owner || "",
        lease_start: ext.lease_start || "", lease_end: ext.lease_end || "", annual_cost: ext.annual_cost ? String(ext.annual_cost) : "", local_currency: ext.local_currency || "USD",
        ai_fair_market_value: "", ai_fair_market_rent: "", ai_valuation_date: ""
      });

      setIsScanning(false);
      setActiveTab("manual");
      setMessage({ type: "success", text: "AI extracted data successfully. Review before saving." });
    } catch (err: any) {
      setIsScanning(false);
      setMessage({ type: "error", text: err.message || "Error processing document with Gemini." });
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ["site_code", "common_name", "activity_type", "divisional_belonging", "legal_entity", "status", "jv_status", "country", "state", "city", "street_address", "zip_code", "latitude", "longitude", "sqm_land", "sqm_building", "contract_type", "leaseholder", "lease_owner", "lease_start", "lease_end", "annual_cost", "local_currency"];
    const mockRow = ["EX-001", "Example Site Name", "Plant", "AM, GTS", "Entity AB", "Operational", "No", "Sweden", "Vastra Gotaland", "Gothenburg", "Example Street 1", "411 00", "57.7089", "11.9746", "5000", "2500", "Rented/Leased", "Tech Corp", "Real Estate AB", "2024-01-01", "2029-12-31", "1200000", "SEK"];
    const csvContent = [headers.join(";"), mockRow.join(";")].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "reAIgent_site_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSV = (str: string, delimiter: string = ',') => {
    const result = []; let row = []; let inQuotes = false; let currentVal = '';
    for (let i = 0; i < str.length; i++) {
      const char = str[i]; const nextChar = str[i + 1];
      if (char === '"' && inQuotes && nextChar === '"') { currentVal += '"'; i++; } 
      else if (char === '"') { inQuotes = !inQuotes; } 
      else if (char === delimiter && !inQuotes) { row.push(currentVal.trim()); currentVal = ''; } 
      else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        row.push(currentVal.trim()); result.push(row); row = []; currentVal = '';
      } else { currentVal += char; }
    }
    row.push(currentVal.trim());
    if (row.length > 0 && row.some(v => v !== '')) result.push(row);
    return result;
  };

  const safeDate = (val: string | undefined) => { if (!val || val.trim() === '') return null; const d = new Date(val); return isNaN(d.getTime()) ? null : val; };
  const safeNumber = (val: string | undefined) => { if (!val || val.trim() === '') return null; const n = parseFloat(val.replace(/,/g, '')); return isNaN(n) ? null : n; };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        let text = event.target?.result as string; text = text.replace(/^\uFEFF/, ''); 
        const firstLine = text.split('\n')[0] || '';
        const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
        let parsedData = parseCSV(text, delimiter).filter(row => row.length > 0 && row.some(cell => cell && cell.trim() !== ''));
        if (parsedData.length < 2) return alert("File appears empty or improperly formatted.");
        
        const headers = parsedData[0].map(h => h?.toLowerCase().trim().replace(/^"|"$/g, ''));
        const structuredData = [];
        
        for(let i = 1; i < parsedData.length; i++) {
           const values = parsedData[i];
           if (!values || values.length === 0) continue;
           const row: any = {};
           row.site_code = values[headers.indexOf("site_code")]?.trim() || `CSV-${Math.floor(Math.random()*10000)}`;
           row.common_name = values[headers.indexOf("common_name")]?.trim() || "Imported Site";
           row.activity_type = values[headers.indexOf("activity_type")]?.trim() || null;
           row.divisional_belonging = values[headers.indexOf("divisional_belonging")]?.trim() || null;
           row.legal_entity = values[headers.indexOf("legal_entity")]?.trim() || null;
           row.jv_status = values[headers.indexOf("jv_status")]?.trim() || "No";
           row.country = values[headers.indexOf("country")]?.trim() || null;
           row.state = values[headers.indexOf("state")]?.trim() || null;
           row.city = values[headers.indexOf("city")]?.trim() || null;
           row.street_address = values[headers.indexOf("street_address")]?.trim() || null;
           row.zip_code = values[headers.indexOf("zip_code")]?.trim() || null;
           row.latitude = safeNumber(values[headers.indexOf("latitude")]);
           row.longitude = safeNumber(values[headers.indexOf("longitude")]);
           row.sqm_land = safeNumber(values[headers.indexOf("sqm_land")]);
           row.sqm_building = safeNumber(values[headers.indexOf("sqm_building")]);
           
           const rawContract = (values[headers.indexOf("contract_type")] || "").trim().toLowerCase();
           row.contract_type = rawContract === "owned" ? "Owned" : "Rented/Leased";
           const rawStatus = (values[headers.indexOf("status")] || "Operational").trim().toLowerCase();
           row.status = rawStatus.includes("sold") || rawStatus.includes("exit") || rawStatus.includes("close") ? "Exited/Sold/Closed" : rawStatus.includes("not in op") ? "Not in Operation" : "Operational";
           
           row.leaseholder = values[headers.indexOf("leaseholder")]?.trim() || null;
           row.lease_owner = values[headers.indexOf("lease_owner")]?.trim() || null;
           row.lease_start = safeDate(values[headers.indexOf("lease_start")]);
           row.lease_end = safeDate(values[headers.indexOf("lease_end")]);
           row.annual_cost = safeNumber(values[headers.indexOf("annual_cost")]);
           row.local_currency = values[headers.indexOf("local_currency")]?.trim() || "USD";
           structuredData.push(row);
        }
        setCsvPreview(structuredData);
      };
      reader.readAsText(file);
    }
  };

  const handleCsvSubmit = async () => {
     if(csvPreview.length === 0) return;
     setIsUploadingCsv(true); setMessage(null);
     const { data: insertedAssets, error } = await supabase.from('assets').insert(csvPreview).select();
     if (error) setMessage({ type: "error", text: error.message });
     else if (insertedAssets) {
        const bulkLogs = insertedAssets.map(asset => ({ site_id: asset.id, user_name: currentUser, description: `Bulk CSV import created site ${asset.site_code}.` }));
        await supabase.from("site_logs").insert(bulkLogs);
        setMessage({ type: "success", text: `${csvPreview.length} sites successfully uploaded!` });
        setCsvPreview([]); setCsvFile(null); setTimeout(() => { fetchSites(); setView("list"); }, 1500);
     }
     setIsUploadingCsv(false);
  };

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const uniqueCountries = Array.from(new Set(sites.map(a => a.country).filter(Boolean)));
  let processedSites = [...sites];

  if (searchQuery) processedSites = processedSites.filter((site) => Object.values(site).some(val => String(val || "").toLowerCase().includes(searchQuery.toLowerCase())));
  if (filters.status) processedSites = processedSites.filter(a => a.status === filters.status);
  if (filters.contract_type) processedSites = processedSites.filter(a => a.contract_type === filters.contract_type);
  if (filters.country) processedSites = processedSites.filter(a => a.country === filters.country);

  if (sortConfig) {
    processedSites.sort((a, b) => {
      const aVal = a[sortConfig.key] || ""; const bVal = b[sortConfig.key] || "";
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }
  
  const SortHeader = ({ label, sortKey }: { label: string, sortKey: string }) => (
    <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => handleSort(sortKey)}>
      <div className="flex items-center space-x-1.5">
        <span>{label}</span>
        {sortConfig?.key === sortKey && <span className="text-blue-600 font-bold">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
      </div>
    </th>
  );

  const isOwned = formData.contract_type === "Owned";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-2 border-b border-slate-200 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">
            {view === "list" ? "Master Database" : view === "detail" ? selectedSite?.common_name : view === "new" ? "Create New Site" : `Editing: ${selectedSite?.site_code}`}
          </h2>
        </div>
        {view === "list" ? (
          canEdit && (
            <button 
              onClick={() => { setSelectedSite(null); setFormData(emptyForm); setPendingFiles([]); setSiteDocuments([]); setSelectedUploadBucket("Lease Agreements"); setActiveTab("manual"); setView("new"); setMessage(null); }} 
              className="mb-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
            >
              <span>+</span> Create Site
            </button>
          )
        ) : (
          <button onClick={() => setView("list")} className="mb-4 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg shadow-sm transition-colors">
            ← Back to Database
          </button>
        )}
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-8">
        {view === "list" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex-1">
                <input type="text" placeholder="Search by site code, name, city, or entity..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all" />
              </div>
              <div className="flex flex-wrap gap-3">
                <select value={filters.status} onChange={(e) => setFilters(prev => ({...prev, status: e.target.value}))} className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                  <option value="">All Statuses</option><option value="Operational">Operational</option><option value="Not in Operation">Not in Operation</option><option value="Exited/Sold/Closed">Exited/Sold/Closed</option>
                </select>
                <select value={filters.contract_type} onChange={(e) => setFilters(prev => ({...prev, contract_type: e.target.value}))} className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                  <option value="">All Contracts</option><option value="Owned">Owned</option><option value="Rented/Leased">Rented/Leased</option>
                </select>
                <select value={filters.country} onChange={(e) => setFilters(prev => ({...prev, country: e.target.value}))} className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                  <option value="">All Countries</option>
                  {uniqueCountries.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </select>
              </div>
            </div>

            <div ref={topScrollRef} onScroll={handleTopScroll} className="w-full overflow-x-auto mb-2 border-b border-slate-200 hidden md:block">
              <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
            </div>

            <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
              <table ref={tableContentRef} className="w-full text-left border-collapse min-w-max whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <SortHeader label="Site Code" sortKey="site_code" />
                    <SortHeader label="Common Name" sortKey="common_name" />
                    <SortHeader label="Status" sortKey="status" />
                    <SortHeader label="Country" sortKey="country" />
                    <SortHeader label="City" sortKey="city" />
                    <SortHeader label="Activity" sortKey="activity_type" />
                    <SortHeader label="Division" sortKey="divisional_belonging" />
                    <SortHeader label="Legal Entity" sortKey="legal_entity" />
                    <SortHeader label="JV" sortKey="jv_status" />
                    <SortHeader label="Street Address" sortKey="street_address" />
                    <SortHeader label="Zip Code" sortKey="zip_code" />
                    <SortHeader label="Bldg Area" sortKey="sqm_building" />
                    <SortHeader label="Contract" sortKey="contract_type" />
                    <SortHeader label="Lease Start" sortKey="lease_start" />
                    <SortHeader label="Lease End" sortKey="lease_end" />
                    <SortHeader label="Annual Cost" sortKey="annual_cost" />
                    <SortHeader label="Curr" sortKey="local_currency" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {processedSites.map((site) => (
                    <tr key={site.id} onClick={() => handleRowClick(site)} className="hover:bg-blue-50/60 cursor-pointer transition-colors group">
                      <td className="px-4 py-3.5 font-semibold text-blue-600 group-hover:text-blue-700">{site.site_code}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-900">{site.common_name}</td>
                      <td className="px-4 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(site.status)}`}>{site.status || "Operational"}</span></td>
                      <td className="px-4 py-3.5 text-slate-600">{site.country || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.city || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.activity_type || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600 truncate max-w-[150px]">{site.divisional_belonging || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.legal_entity || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.jv_status || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600 truncate max-w-[200px]">{site.street_address || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.zip_code || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.sqm_building ? site.sqm_building.toLocaleString() : "-"} sqm</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.contract_type || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.lease_start || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.lease_end || "-"}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{site.annual_cost ? site.annual_cost.toLocaleString() : "-"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{site.local_currency || "-"}</td>
                    </tr>
                  ))}
                  {processedSites.length === 0 && (
                    <tr><td colSpan={17} className="px-6 py-12 text-center text-slate-400 text-sm">No sites match your search or filter criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "detail" && selectedSite && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {canEdit && (
              <div className="flex justify-end gap-3">
                <button onClick={handleDelete} className="px-5 py-2.5 text-rose-600 bg-rose-50 hover:bg-rose-100 font-semibold rounded-lg transition-colors text-sm border border-rose-100">Delete Site</button>
                <button onClick={() => setView("edit")} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all">Edit Site</button>
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Identification & Governance</h4></div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-8">
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Site Code</span><span className="text-sm font-semibold text-slate-900">{selectedSite.site_code}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Common Name</span><span className="text-sm font-semibold text-slate-900">{selectedSite.common_name}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Activity Type</span><span className="text-sm font-semibold text-slate-900">{selectedSite.activity_type || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Status</span><span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(selectedSite.status)}`}>{selectedSite.status || "Operational"}</span></div>
                <div className="md:col-span-2"><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Legal Entity</span><span className="text-sm font-semibold text-slate-900">{selectedSite.legal_entity || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Division</span><span className="text-sm font-semibold text-slate-900">{selectedSite.divisional_belonging || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Joint Venture</span><span className="text-sm font-semibold text-slate-900">{selectedSite.jv_status}</span></div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Physical & Geographic Profile</h4></div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-8">
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Country</span><span className="text-sm font-semibold text-slate-900">{selectedSite.country || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">State / Province</span><span className="text-sm font-semibold text-slate-900">{selectedSite.state || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">City</span><span className="text-sm font-semibold text-slate-900">{selectedSite.city || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Zip Code</span><span className="text-sm font-semibold text-slate-900">{selectedSite.zip_code || "-"}</span></div>
                <div className="md:col-span-2"><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Street Address</span><span className="text-sm font-semibold text-slate-900">{selectedSite.street_address || "-"}</span></div>
                <div className="md:col-span-2"><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Total Area</span><span className="text-sm font-semibold text-slate-900">Building: {selectedSite.sqm_building || 0} sqm | Land: {selectedSite.sqm_land || 0} sqm</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Coordinates</span><span className="text-sm font-semibold text-slate-900">{selectedSite.latitude || "-"}, {selectedSite.longitude || "-"}</span></div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Contract & Financials</h4></div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Contract Type</span><span className="text-sm font-semibold text-slate-900">{selectedSite.contract_type}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Lease Term</span><span className="text-sm font-semibold text-slate-900">{selectedSite.lease_start || "-"} to {selectedSite.lease_end || "-"}</span></div>
                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Annual Cost</span><span className="text-sm font-semibold text-slate-900">{selectedSite.annual_cost ? `${selectedSite.annual_cost.toLocaleString()} ${selectedSite.local_currency}` : "-"}</span></div>
                
                {selectedSite.contract_type === "Owned" && selectedSite.ai_fair_market_value && (
                  <div>
                    <span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">
                      AI Fair Market Value
                      {selectedSite.ai_valuation_date && (
                        <span className="normal-case font-normal tracking-normal ml-1.5">
                          (Imported {new Date(selectedSite.ai_valuation_date).toLocaleDateString()})
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{Number(selectedSite.ai_fair_market_value).toLocaleString()} {selectedSite.local_currency}</span>
                  </div>
                )}
                {selectedSite.contract_type === "Rented/Leased" && selectedSite.ai_fair_market_rent && (
                  <div>
                    <span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">
                      AI Fair Market Rent
                      {selectedSite.ai_valuation_date && (
                        <span className="normal-case font-normal tracking-normal ml-1.5">
                          (Imported {new Date(selectedSite.ai_valuation_date).toLocaleDateString()})
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{Number(selectedSite.ai_fair_market_rent).toLocaleString()} {selectedSite.local_currency}</span>
                  </div>
                )}

                <div><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Leaseholder (Tenant)</span><span className="text-sm font-semibold text-slate-900">{selectedSite.leaseholder || "-"}</span></div>
                <div className="md:col-span-2"><span className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Lease Owner (Landlord)</span><span className="text-sm font-semibold text-slate-900">{selectedSite.lease_owner || "-"}</span></div>
              </div>
            </div>

            {/* 4-Bucket Document Repository in Site Detail View */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Document Repository</h4>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {siteDocuments.length} Total Document{siteDocuments.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {DOC_BUCKETS.map(bucket => {
                    const docsInBucket = siteDocuments.filter(d => resolveDocBucket(d) === bucket.key);
                    return (
                      <div key={bucket.key} className="border border-slate-200 rounded-xl bg-slate-50/40 p-5 flex flex-col">
                        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-200/80">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{bucket.icon}</span>
                            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800">{bucket.key}</h5>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bucket.badgeClass}`}>
                            {docsInBucket.length}
                          </span>
                        </div>

                        {docsInBucket.length > 0 ? (
                          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                            {docsInBucket.map(doc => (
                              <a
                                key={doc.id}
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group"
                              >
                                <div className="text-2xl mr-3 group-hover:scale-105 transition-transform flex-shrink-0">
                                  {getFileIcon(doc.file_name)}
                                </div>
                                <div className="overflow-hidden flex-1">
                                  <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 truncate transition-colors" title={doc.file_name}>
                                    {doc.file_name}
                                  </p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    {(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-xs text-slate-400 italic">
                            No {bucket.key.toLowerCase()} stored.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mt-8">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Change Log</h4>
              </div>
              <div className="p-0 overflow-x-auto">
                {siteLogs.length > 0 ? (
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date & Time</th>
                        <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {siteLogs.map((log, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-slate-600 align-top">{new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                          <td className="px-6 py-3 font-medium text-slate-800 align-top">{log.user_name}</td>
                          <td className="px-6 py-3 text-slate-600 whitespace-normal min-w-[300px]">{log.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center flex flex-col items-center">
                    <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-600">No History Available</p>
                    <p className="text-xs text-slate-400 mt-1">Changes made to this site profile will be logged here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {canEdit && (view === "new" || view === "edit") && (
          <div className="animate-in fade-in duration-300">
            {view === "new" && (
              <div className="flex space-x-1 mb-8 bg-slate-100 p-1 rounded-xl w-fit border border-slate-200 shadow-inner">
                <button onClick={() => setActiveTab("manual")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"}`}>Manual Entry</button>
                <button onClick={() => setActiveTab("csv")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === "csv" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"}`}>Bulk CSV Upload</button>
                <button onClick={() => setActiveTab("ai")} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === "ai" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"}`}>✨ AI Scanner</button>
              </div>
            )}

            {message && (
              <div className={`p-4 mb-8 rounded-lg text-sm font-semibold flex items-center gap-3 ${message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                {message.text}
              </div>
            )}

            {(activeTab === "manual" || view === "edit") && (
              <form onSubmit={handleSubmit} className="space-y-8">
                
                <div className="bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm p-8">
                  <h4 className="text-sm font-bold uppercase text-slate-800 mb-6 border-b border-slate-200 pb-3">Identification & Governance</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Site Code *</label><input required name="site_code" value={formData.site_code} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" disabled={view === 'edit'} /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Common Name *</label><input required name="common_name" value={formData.common_name} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Activity Type *</label>
                      <select required name="activity_type" value={formData.activity_type} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none cursor-pointer">
                        <option value="">-- Select Activity --</option>
                        {ACTIVITIES.map(act => <option key={act} value={act}>{act}</option>)}
                      </select>
                    </div>
                    
                    <div className="relative" ref={divDropdownRef}>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Division (Multi-Select) *</label>
                      <div 
                        className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg p-2.5 cursor-pointer min-h-[42px] flex items-center justify-between"
                        onClick={() => setIsDivOpen(!isDivOpen)}
                      >
                        <span className="truncate">{formData.divisional_belonging || "-- Select Divisions --"}</span>
                        <span className="text-slate-400 text-xs">▼</span>
                      </div>
                      {isDivOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {DIVISIONS.map(div => {
                            const isSelected = formData.divisional_belonging.split(",").map(s => s.trim()).includes(div);
                            return (
                              <label key={div} className="flex items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                                <input type="checkbox" checked={isSelected} onChange={() => handleDivisionToggle(div)} className="mr-3 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                {div}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Legal Entity *</label><input required name="legal_entity" value={formData.legal_entity} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Status *</label>
                      <select required name="status" value={formData.status} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none cursor-pointer">
                        <option value="Operational">Operational</option>
                        <option value="Not in Operation">Not in Operation</option>
                        <option value="Exited/Sold/Closed">Exited/Sold/Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Joint Venture</label>
                      <select name="jv_status" value={formData.jv_status} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none cursor-pointer">
                        <option value="No">No</option>
                        <option value="Yes - Majority">Yes - Majority</option>
                        <option value="Yes - Minority">Yes - Minority</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm p-8">
                  <h4 className="text-sm font-bold uppercase text-slate-800 mb-6 border-b border-slate-200 pb-3">Physical & Geographic</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Country *</label><input required name="country" value={formData.country} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">State / Province</label><input name="state" value={formData.state} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">City *</label><input required name="city" value={formData.city} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div className="md:col-span-2"><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Street Address *</label><input required name="street_address" value={formData.street_address} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Zip Code *</label><input required name="zip_code" value={formData.zip_code} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Building Area (sqm) *</label><input required type="number" step="any" name="sqm_building" value={formData.sqm_building} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Land Area (sqm)</label><input type="number" step="any" name="sqm_land" value={formData.sqm_land} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div className="hidden md:block"></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Latitude *</label><input required type="number" step="any" name="latitude" value={formData.latitude} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Longitude *</label><input required type="number" step="any" name="longitude" value={formData.longitude} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none" /></div>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm p-8">
                  <h4 className="text-sm font-bold uppercase text-slate-800 mb-6 border-b border-slate-200 pb-3">Contract & Financial Profile</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">Contract Type *</label>
                      <select required name="contract_type" value={formData.contract_type} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none cursor-pointer">
                        <option value="Rented/Leased">Rented/Leased</option>
                        <option value="Owned">Owned</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className={`block text-xs font-semibold mb-2 uppercase ${isOwned ? 'text-slate-400' : 'text-slate-600'}`}>Lease Start Date {!isOwned && '*'}</label>
                      <input required={!isOwned} disabled={isOwned} type="date" name="lease_start" value={formData.lease_start} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                    </div>
                    
                    <div>
                      <label className={`block text-xs font-semibold mb-2 uppercase ${isOwned ? 'text-slate-400' : 'text-slate-600'}`}>Lease Expiration Date {!isOwned && '*'}</label>
                      <input required={!isOwned} disabled={isOwned} type="date" name="lease_end" value={formData.lease_end} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                    </div>
                    
                    <div>
                      <label className={`block text-xs font-semibold mb-2 uppercase ${isOwned ? 'text-slate-400' : 'text-slate-600'}`}>Annual Cost {!isOwned && '*'}</label>
                      <input required={!isOwned} disabled={isOwned} type="number" step="any" name="annual_cost" value={formData.annual_cost} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                    </div>
                    
                    <div>
                      <label className={`block text-xs font-semibold mb-2 uppercase ${isOwned ? 'text-slate-400' : 'text-slate-600'}`}>Local Currency {!isOwned && '*'}</label>
                      <input required={!isOwned} disabled={isOwned} list="currency-codes" name="local_currency" value={formData.local_currency} onChange={handleChange} placeholder="Search or select..." className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                      <datalist id="currency-codes">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
                    </div>
                    
                    <div className="hidden md:block"></div>

                    {(formData.ai_fair_market_value || formData.ai_fair_market_rent) && (
                      <>
                         {formData.ai_fair_market_value && (
                           <div>
                             <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                               AI Fair Market Value (Locked)
                               {formData.ai_valuation_date && (
                                 <span className="normal-case text-[10px] ml-1 font-normal tracking-normal">- Imported {new Date(formData.ai_valuation_date).toLocaleDateString()}</span>
                               )}
                             </label>
                             <input disabled value={`${Number(formData.ai_fair_market_value).toLocaleString()} ${formData.local_currency}`} className="w-full bg-slate-100 border border-slate-200 text-slate-500 font-semibold text-sm rounded-lg block p-2.5 outline-none cursor-not-allowed" title="Updated exclusively via the Valuation Tool" />
                           </div>
                         )}
                         {formData.ai_fair_market_rent && (
                           <div>
                             <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                               AI Fair Market Rent (Locked)
                               {formData.ai_valuation_date && (
                                 <span className="normal-case text-[10px] ml-1 font-normal tracking-normal">- Imported {new Date(formData.ai_valuation_date).toLocaleDateString()}</span>
                               )}
                             </label>
                             <input disabled value={`${Number(formData.ai_fair_market_rent).toLocaleString()} ${formData.local_currency}`} className="w-full bg-slate-100 border border-slate-200 text-slate-500 font-semibold text-sm rounded-lg block p-2.5 outline-none cursor-not-allowed" title="Updated exclusively via the Valuation Tool" />
                           </div>
                         )}
                      </>
                    )}
                    
                    <div className="md:col-span-1">
                      <label className={`block text-xs font-semibold mb-2 uppercase ${isOwned ? 'text-slate-400' : 'text-slate-600'}`}>Leaseholder (Tenant) {!isOwned && '*'}</label>
                      <input required={!isOwned} disabled={isOwned} name="leaseholder" value={formData.leaseholder} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className={`block text-xs font-semibold mb-2 uppercase ${isOwned ? 'text-slate-400' : 'text-slate-600'}`}>Lease Owner (Landlord) {!isOwned && '*'}</label>
                      <input required={!isOwned} disabled={isOwned} name="lease_owner" value={formData.lease_owner} onChange={handleChange} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-2.5 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* 4-Bucket Document Repository & Upload Manager */}
                <div className="bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm p-8 space-y-8">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <h4 className="text-sm font-bold uppercase text-slate-800">Site Documents & Repository</h4>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      4-Bucket Structured Vault
                    </span>
                  </div>

                  {/* Existing Uploaded Documents Grouped into 4 Buckets (Shown in Edit Mode) */}
                  {view === "edit" && (
                    <div>
                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                        Existing Uploaded Documents ({siteDocuments.length})
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {DOC_BUCKETS.map(bucket => {
                          const docsInBucket = siteDocuments.filter(d => resolveDocBucket(d) === bucket.key);
                          return (
                            <div key={bucket.key} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span>{bucket.icon}</span>
                                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">{bucket.key}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bucket.badgeClass}`}>
                                  {docsInBucket.length}
                                </span>
                              </div>

                              {docsInBucket.length > 0 ? (
                                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                  {docsInBucket.map(doc => (
                                    <div
                                      key={doc.id}
                                      className="flex items-center justify-between bg-slate-50 border border-slate-200/80 p-2.5 rounded-lg hover:border-slate-300 transition-all"
                                    >
                                      <a
                                        href={doc.file_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center overflow-hidden mr-3 group flex-1"
                                        title={`Open ${doc.file_name}`}
                                      >
                                        <span className="text-xl mr-2.5 flex-shrink-0 group-hover:scale-105 transition-transform">
                                          {getFileIcon(doc.file_name)}
                                        </span>
                                        <div className="overflow-hidden">
                                          <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 truncate transition-colors">
                                            {doc.file_name}
                                          </p>
                                          <p className="text-[10px] text-slate-400 mt-0.5">
                                            {(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.created_at).toLocaleDateString()}
                                          </p>
                                        </div>
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteExistingDocument(doc)}
                                        disabled={deletingDocId === doc.id}
                                        className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors flex-shrink-0 disabled:opacity-50"
                                        title="Delete document permanently"
                                      >
                                        {deletingDocId === doc.id ? "Deleting..." : "Delete"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 italic py-4 text-center">
                                  No {bucket.key.toLowerCase()} uploaded.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Upload New Documents Section with Bucket Selector ("Lease Agreements" vs "Other") */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        1. Select Target Bucket & Add Files
                      </h5>
                      
                      {/* Bucket Toggle for Manual Uploads */}
                      <div className="flex bg-slate-200/70 p-1 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setSelectedUploadBucket("Lease Agreements")}
                          className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                            selectedUploadBucket === "Lease Agreements"
                              ? "bg-white text-blue-700 shadow-sm border border-slate-200/60"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <span>📜</span> Lease Agreements
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedUploadBucket("Other")}
                          className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                            selectedUploadBucket === "Other"
                              ? "bg-white text-blue-700 shadow-sm border border-slate-200/60"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <span>📁</span> Other
                        </button>
                      </div>

                      <div 
                        className="border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-xl p-8 text-center cursor-pointer hover:bg-blue-50/70 hover:border-blue-300 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="text-3xl mb-3">
                          {selectedUploadBucket === "Lease Agreements" ? "📜" : "📁"}
                        </div>
                        <p className="text-sm font-bold text-slate-700">
                          Click to Add to &ldquo;{selectedUploadBucket}&rdquo;
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-[260px] mx-auto">
                          {selectedUploadBucket === "Lease Agreements"
                            ? "Upload commercial leases, addendums, and renewal schedules."
                            : "Upload deeds, floorplans, invoices, permits, or site photos."}
                        </p>
                        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                      </div>
                    </div>

                    <div>
                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                        2. New Files Queued for Upload ({pendingFiles.length})
                      </h5>
                      {pendingFiles.length > 0 ? (
                        <ul className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                          {pendingFiles.map((item, idx) => (
                            <li key={idx} className="flex items-center justify-between bg-white border border-slate-200 p-2.5 rounded-lg shadow-sm gap-2">
                              <div className="flex items-center overflow-hidden flex-1">
                                <span className="text-lg mr-2 flex-shrink-0">{getFileIcon(item.file.name)}</span>
                                <span className="text-xs font-semibold text-slate-800 truncate" title={item.file.name}>
                                  {item.file.name}
                                </span>
                              </div>
                              <select
                                value={item.category}
                                onChange={(e) => updatePendingFileCategory(idx, e.target.value as ManualDocBucket)}
                                className="text-[11px] font-bold bg-slate-50 border border-slate-200 text-slate-700 rounded px-2 py-1 outline-none cursor-pointer"
                                title="Change target bucket"
                              >
                                <option value="Lease Agreements">Lease Agreements</option>
                                <option value="Other">Other</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removePendingFile(idx)}
                                className="text-slate-400 hover:text-rose-500 transition-colors p-1 flex-shrink-0"
                                title="Remove from queue"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="h-44 flex items-center justify-center border border-slate-200/80 bg-white rounded-xl">
                          <p className="text-xs font-medium text-slate-400">No new files queued for upload.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center pt-4">
                  <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all text-sm disabled:opacity-50 flex items-center gap-2">
                    {isSubmitting ? "Processing..." : view === "edit" ? "Update Site Data & Save Docs" : "Save New Site & Docs"}
                  </button>
                </div>
              </form>
            )}

            {view === "new" && activeTab === "csv" && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <h3 className="text-lg font-bold text-slate-900">Bulk Portfolio Import</h3>
                  <button onClick={handleDownloadTemplate} className="px-5 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-sm">
                    ↓ Download CSV Template
                  </button>
                </div>
                
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center bg-slate-50 mb-8 hover:bg-slate-100 transition-colors">
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="block mx-auto text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer transition-colors" />
                  <p className="text-sm font-medium text-slate-500 mt-4">Upload your formatted Excel CSV data.</p>
                </div>

                {csvPreview.length > 0 && (
                  <div className="animate-in fade-in duration-500 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 text-lg">Verification: {csvPreview.length} Sites Extracted</h4>
                      <button onClick={handleCsvSubmit} disabled={isUploadingCsv} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-all text-sm disabled:opacity-50">
                        {isUploadingCsv ? "Importing..." : "Confirm & Import Portfolio"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === "new" && activeTab === "ai" && (
              <div className="text-center animate-in fade-in duration-300 py-4">
                <h3 className="text-xl font-bold text-slate-900 mb-3">AI Document Intelligence</h3>
                <p className="text-slate-500 mb-8 text-sm max-w-2xl mx-auto leading-relaxed">
                  Upload any commercial lease agreement, property deed, or operational contract.
                </p>

                <div className="relative border-2 border-dashed border-blue-300 rounded-2xl p-16 bg-blue-50/30 hover:bg-blue-50/80 transition-colors flex flex-col items-center justify-center min-h-[300px] max-w-3xl mx-auto group">
                  <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleDocumentScan} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isScanning} />
                  
                  {!isScanning ? (
                    <>
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-5 text-blue-600 shadow-md group-hover:scale-105 transition-transform">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1.724 1.724 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="text-lg font-bold text-blue-900 mb-2">Drag & Drop Document to Scan</p>
                    </>
                  ) : (
                    <div className="z-20 relative">
                      <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-5"></div>
                      <p className="text-base font-bold text-blue-900 mb-1">{scanStatusText}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}