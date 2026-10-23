/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface LeaseDocItem {
  file_url: string;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized request" }, { status: 403 });
    }

    const body = await req.json() as { leaseDocs?: LeaseDocItem[] };
    const leaseDocs = body.leaseDocs;

    if (!leaseDocs || !Array.isArray(leaseDocs) || leaseDocs.length === 0) {
      return NextResponse.json({ error: "No lease documents provided for analysis" }, { status: 400 });
    }

    const pdfParts = await Promise.all(leaseDocs.map(async (doc: LeaseDocItem) => {
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

    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: `You are an elite commercial real estate forensic auditor and legal analyst. 
      Analyze the provided lease documents and return your response strictly as a valid JSON object with NO markdown formatting, backticks, or extra text.

      The JSON object must have exactly these keys and types:
      - landlord_name (string)
      - tenant_name (string)
      - commencement_date (string)
      - expiration_date (string)
      - annual_rent (number)
      - currency (string)
      - most_recent_document_date (string)
      - is_chronology_intact (boolean)
      - is_expired_or_holdover (boolean)
      - missing_amendments (array of strings)
      - term_inconsistencies (array of strings)
      - amendment_reference_errors (array of strings)
      - forensic_audit_summary (string)
      - executive_summary (object with: strengths [array of strings], weaknesses [array of strings], negotiation_playbook [object with: must_haves, things_to_remove, things_to_add, things_to_consider - all arrays of strings])
      - clause_analysis (array of objects, each with: id [number], title [string], extracted_terms [string], risk_analysis [string], risk_level [string: 'High', 'Medium', 'Low', or 'Info'])`,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const promptMessage = `Perform the comprehensive forensic audit and 15-point deep dive on this set of ${leaseDocs.length} commercial real estate lease document(s).`;
    const result = await model.generateContent([promptMessage, ...pdfParts]);
    
    let responseText = result.response.text();
    responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();

    return NextResponse.json({ data: JSON.parse(responseText) });

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Failed to process lease documents";
    console.error("Lease Analytics Error:", error);
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}