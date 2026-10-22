import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!);

function getMimeTypeFromUrl(url: string, contentTypeHeader?: string | null): string {
  if (contentTypeHeader && contentTypeHeader.includes("/") && !contentTypeHeader.includes("octet-stream")) {
    return contentTypeHeader.split(";")[0].trim();
  }
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".pdf")) return "application/pdf";
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "image/jpeg";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".txt") || cleanUrl.endsWith(".csv")) return "text/plain";
  return "application/pdf";
}

export async function POST(req: Request) {
  const tempFiles: string[] = [];
  
  try {
    const formData = await req.formData();
    // Support both fileUrls[] and fileUrls keys, plus direct file uploads if ever passed
    const rawUrls = [
      ...formData.getAll("fileUrls[]"),
      ...formData.getAll("fileUrls"),
    ].map((u) => String(u).trim()).filter(Boolean);

    const uniqueFileUrls = Array.from(new Set(rawUrls));
    const directFiles = formData.getAll("files") as File[];

    if (uniqueFileUrls.length === 0 && directFiles.length === 0) {
      return NextResponse.json({ error: "No documents provided for analysis" }, { status: 400 });
    }

    // LOCK TO STABLE PRODUCTION MODEL
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parts: any[] = [];
    const loadedDocNames: string[] = [];

    // 1. Fetch, save to disk temporarily, and upload via Google File API to prevent Next.js memory crashes
    for (const url of uniqueFileUrls) {
      try {
        const fileRes = await fetch(url);
        if (fileRes.ok) {
          const arrayBuffer = await fileRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mimeType = getMimeTypeFromUrl(url, fileRes.headers.get("content-type"));
          
          const fileName = decodeURIComponent(url.split("/").pop()?.split("?")[0] || `file_${Date.now()}.pdf`);
          const tempPath = path.join(os.tmpdir(), fileName);
          
          fs.writeFileSync(tempPath, buffer);
          tempFiles.push(tempPath);

          const uploadResult = await fileManager.uploadFile(tempPath, {
            mimeType: mimeType,
            displayName: fileName,
          });

          parts.push({
            fileData: {
              mimeType: uploadResult.file.mimeType,
              fileUri: uploadResult.file.uri,
            },
          });

          loadedDocNames.push(fileName);
        } else {
          loadedDocNames.push(url);
        }
      } catch (fetchErr) {
        console.warn("Could not fetch document binary from URL:", url, fetchErr);
        loadedDocNames.push(url);
      }
    }

    // 2. Also support any directly uploaded File objects via the File API
    for (const file of directFiles) {
      if (file && typeof file.arrayBuffer === "function") {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = getMimeTypeFromUrl(file.name, file.type);
        
        const tempPath = path.join(os.tmpdir(), file.name);
        fs.writeFileSync(tempPath, buffer);
        tempFiles.push(tempPath);

        const uploadResult = await fileManager.uploadFile(tempPath, {
          mimeType: mimeType,
          displayName: file.name,
        });

        parts.push({
          fileData: {
            mimeType: uploadResult.file.mimeType,
            fileUri: uploadResult.file.uri,
          },
        });
        loadedDocNames.push(file.name);
      }
    }

    const prompt = `You are an expert commercial real estate attorney, corporate portfolio strategist, and lease auditor.
Review the attached lease agreement(s), addendums, amendments, and appendices (${loadedDocNames.join(", ")}).
Synthesize the collective text across all documents (ensuring that later amendments/addendums supersede earlier baseline terms where applicable) and extract the intelligence strictly into the requested JSON schema.

Generate exactly 15 key commercial lease clauses in the "clause_analysis" array:
1. "Lease Term, Notice Period(s) & Renewal Options" (MUST BE CLAUSE #1 — see mandatory deep-dive requirements below)
2. "Base Rent & Rent Escalation / Indexation"
3. "Operating Expenses (OPEX), CAM & Service Charges"
4. "Taxes, Insurance & Utilities"
5. "Security Deposit, Bank Guarantee & Parent Company Guarantee"
6. "Maintenance, Repair & Structural Responsibilities"
7. "Alterations, Fit-Out & Reinstatement / Make-Good Obligations"
8. "Permitted Use & Exclusivity"
9. "Assignment, Subletting & Change of Control"
10. "Early Termination, Break Options & Contraction Rights"
11. "Right of First Refusal (ROFR) / Expansion Rights"
12. "Default, Cure Periods & Landlord Remedies"
13. "Indemnification, Liability Caps & Environmental Compliance"
14. "Casualty, Condemnation & Force Majeure"
15. "Holdover, Surrender & Dispute Resolution / Governing Law"

CRITICAL REQUIREMENT FOR CLAUSE #1 ("Lease Term, Notice Period(s) & Renewal Options"):
- In "extracted_terms", you MUST explicitly identify and break down all three components:
  (a) LEASE TERM: Exact commencement date, current expiration date, and total duration (incorporating any active extensions/addendums).
  (b) NOTICE PERIOD(S): All required prior written notice periods and exact deadline windows for non-renewal, exercising renewal options, or termination (e.g., "Tenant must give at least 9 months prior written notice"), whether the lease automatically rolls over/extends if notice is not given on time, and any strict notice delivery methods.
  (c) RENEWAL OPTIONS: Number of renewal/extension options remaining, length of each renewal period, conditions to exercise, and how renewal rent is determined (e.g., Fair Market Rent, CPI, or fixed step-up).
- In "risk_analysis", evaluate the commercial and operational risks of the term length, flag any tight, unforgiving, or automatic rollover notice periods, and assess whether the renewal option pricing mechanism favors the Tenant or Landlord.

OUTPUT JSON SCHEMA (Return ONLY a single valid JSON object matching this exact structure):
{
  "executive_summary": {
    "strengths": ["string"],
    "weaknesses": ["string"],
    "negotiation_playbook": {
      "must_haves": ["string"],
      "things_to_remove": ["string"],
      "things_to_add": ["string"],
      "things_to_consider": ["string"]
    }
  },
  "clause_analysis": [
    {
      "id": 1,
      "title": "Lease Term, Notice Period(s) & Renewal Options",
      "extracted_terms": "string (comprehensive breakdown of Lease Term, Notice Period(s), and Renewal Options as written in the contract)",
      "risk_analysis": "string (expert legal and commercial risk assessment covering term lock-in, notice deadline traps, and renewal leverage)",
      "risk_level": "High"
    }
  ]
}`;

    parts.push({ text: prompt });

    const result = await model.generateContent(parts);
    const rawText = result.response.text() || "{}";
    const cleanedJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonResponse = JSON.parse(cleanedJson);

    return NextResponse.json({ data: jsonResponse });
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ error: error.message || "Failed to analyze lease documents" }, { status: 500 });
  } finally {
    // 3. Clean up the local temp files immediately to free space
    tempFiles.forEach(tempPath => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        console.error("Failed to clean up temp file:", tempPath, e);
      }
    });
  }
}