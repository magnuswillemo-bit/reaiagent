import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

    // 4. Unified AI Configuration: Forensic Audit + 15-Point Deep Dive Schema using string literals
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: `You are an elite commercial real estate forensic auditor and legal analyst. 
      Your task is to analyze the provided stack of lease documents (primary agreement plus any amendments) and return a comprehensive structured JSON response.

      PHASE 1: FORENSIC INTEGRITY AUDIT
      - Cross-reference all provided files. Identify the chronological order.
      - Calculate the active lease term and track if the lease is currently expired/in holdover (is_expired_or_holdover).
      - Flag missing amendments: If a document references an amendment or exhibit not present in the files, list it in missing_amendments.
      - Flag term inconsistencies: Any conflicting dates or mathematical errors in the timeline.
      - Flag amendment reference errors: Amendments that cite paragraphs missing from the main lease.
      
      PHASE 2: EXECUTIVE SUMMARY & PLAYBOOK
      - Extract key contract strengths and weaknesses.
      - Formulate a pre-negotiation playbook (must-haves, removals, additions, considerations).
      
      PHASE 3: 15-POINT CLAUSE DEEP DIVE
      - Extract specific terms and provide risk analysis for standard commercial clauses (Term, Rent, Maintenance, Insurance, Defaults, Assignment, etc.).
      - Assign a risk_level (High, Medium, Low, or Info) to each clause based on tenant exposure.`,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            // Standard Metadata
            landlord_name: { type: "STRING" },
            tenant_name: { type: "STRING" },
            commencement_date: { type: "STRING" },
            expiration_date: { type: "STRING" },
            annual_rent: { type: "NUMBER" },
            currency: { type: "STRING" },
            
            // Forensic Audit
            most_recent_document_date: { type: "STRING" },
            is_chronology_intact: { type: "BOOLEAN" },
            is_expired_or_holdover: { type: "BOOLEAN" },
            missing_amendments: { type: "ARRAY", items: { type: "STRING" } },
            term_inconsistencies: { type: "ARRAY", items: { type: "STRING" } },
            amendment_reference_errors: { type: "ARRAY", items: { type: "STRING" } },
            forensic_audit_summary: { type: "STRING" },

            // Executive Summary
            executive_summary: {
              type: "OBJECT",
              properties: {
                strengths: { type: "ARRAY", items: { type: "STRING" } },
                weaknesses: { type: "ARRAY", items: { type: "STRING" } },
                negotiation_playbook: {
                  type: "OBJECT",
                  properties: {
                    must_haves: { type: "ARRAY", items: { type: "STRING" } },
                    things_to_remove: { type: "ARRAY", items: { type: "STRING" } },
                    things_to_add: { type: "ARRAY", items: { type: "STRING" } },
                    things_to_consider: { type: "ARRAY", items: { type: "STRING" } }
                  },
                  required: ["must_haves", "things_to_remove", "things_to_add", "things_to_consider"]
                }
              },
              required: ["strengths", "weaknesses", "negotiation_playbook"]
            },

            // 15-Point Clause Analysis
            clause_analysis: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "NUMBER" },
                  title: { type: "STRING" },
                  extracted_terms: { type: "STRING" },
                  risk_analysis: { type: "STRING" },
                  risk_level: { type: "STRING", description: "Must be 'High', 'Medium', 'Low', or 'Info'" }
                },
                required: ["id", "title", "extracted_terms", "risk_analysis", "risk_level"]
              }
            }
          },
          required: [
            "landlord_name", "tenant_name", "commencement_date", "expiration_date", 
            "most_recent_document_date", "is_chronology_intact", "is_expired_or_holdover",
            "executive_summary", "clause_analysis"
          ]
        }
      }
    });

    // 5. Execute Batch AI Analysis
    const promptMessage = `Perform the comprehensive forensic audit and 15-point deep dive on this set of ${leaseDocs.length} commercial real estate lease document(s).`;
    const result = await model.generateContent([promptMessage, ...pdfParts]);
    
    const responseText = result.response.text();
    return NextResponse.json({ data: JSON.parse(responseText) });

  } catch (error: any) {
    console.error("Lease Analytics Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process lease documents" }, { status: 500 });
  }
}