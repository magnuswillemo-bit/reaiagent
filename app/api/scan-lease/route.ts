import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Initialize external clients
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    // 1. JWT Security Validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) return NextResponse.json({ error: "Unauthorized request" }, { status: 403 });

    // 2. Extract Document Array from Request
    const { leaseDocs } = await req.json();
    if (!leaseDocs || !Array.isArray(leaseDocs) || leaseDocs.length === 0) {
      return NextResponse.json({ error: "No lease documents provided for analysis" }, { status: 400 });
    }

    // 3. Download and format all PDFs for Gemini inline processing
    const pdfParts = await Promise.all(leaseDocs.map(async (doc: any) => {
      const response = await fetch(doc.file_url);
      const arrayBuffer = await response.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      
      return {
        inlineData: {
          data: base64Data,
          mimeType: "application/pdf"
        }
      };
    }));

    // 4. Unified AI Configuration & Forensic Schema
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: `You are an expert commercial real estate forensic auditor. 
      First, extract the standard commercial lease metadata (parties, rent, dates) from the provided documents.
      Second, audit the entire stack of provided documents against each other executing these strict forensic rules:
      1. Chronology: Identify the most recent document and base all active terms on it.
      2. Missing Amendments: If any text references an Amendment, Addendum, or Exhibit not present in the provided files, flag it explicitly in missing_amendments.
      3. Paragraph Cross-Referencing: Verify that any uploaded amendments correctly reference existing paragraphs or clauses in the primary lease agreement. Flag orphaned clauses in amendment_reference_errors.
      4. Term Consistency: Calculate the lease term based on commencement and expiration dates. Flag missing lease terms, mathematical inconsistencies, or conflicting dates between documents in term_inconsistencies.
      5. Expiration Risk: Compare the final established expiration date against the current date. Mark is_expired_or_holdover as true if the lease has lapsed without a provided extension.`,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            landlord_name: { type: SchemaType.STRING },
            tenant_name: { type: SchemaType.STRING },
            commencement_date: { type: SchemaType.STRING },
            expiration_date: { type: SchemaType.STRING },
            annual_rent: { type: SchemaType.NUMBER },
            currency: { type: SchemaType.STRING },
            most_recent_document_date: { type: SchemaType.STRING },
            is_chronology_intact: { type: SchemaType.BOOLEAN },
            missing_amendments: { 
              type: SchemaType.ARRAY, 
              items: { type: SchemaType.STRING },
              description: "List of any amendments, addendums, or exhibits referenced in the text but missing from the provided files."
            },
            term_inconsistencies: { 
              type: SchemaType.ARRAY, 
              items: { type: SchemaType.STRING },
              description: "Any conflicting dates, missing defined lease terms, or timeline math errors."
            },
            amendment_reference_errors: { 
              type: SchemaType.ARRAY, 
              items: { type: SchemaType.STRING },
              description: "List of amendments that reference paragraphs or clauses not found in the main agreement."
            },
            is_expired_or_holdover: { type: SchemaType.BOOLEAN },
            forensic_audit_summary: { type: SchemaType.STRING }
          },
          required: [
            "landlord_name", "tenant_name", "commencement_date", "expiration_date", 
            "annual_rent", "currency", "most_recent_document_date", "is_chronology_intact", 
            "missing_amendments", "term_inconsistencies", "amendment_reference_errors", 
            "is_expired_or_holdover", "forensic_audit_summary"
          ]
        }
      }
    });

    // 5. Execute Batch AI Analysis
    const promptMessage = `Analyze this set of lease documents for ${leaseDocs.length} chronological forensic consistency.`;
    const result = await model.generateContent([promptMessage, ...pdfParts]);
    
    const responseText = result.response.text();
    return NextResponse.json(JSON.parse(responseText));

  } catch (error: any) {
    console.error("Lease Analytics Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process lease documents" }, { status: 500 });
  }
}