import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!);

function getMimeType(fileName: string, fallbackType?: string): string {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "txt" || ext === "csv") return "text/plain";
  if (fallbackType && fallbackType.includes("/") && !fallbackType.includes(" ")) {
    return fallbackType;
  }
  return "application/pdf";
}

export async function POST(req: Request) {
  const tempFiles: string[] = [];

  try {
    const { site, leaseDocs } = await req.json();

    if (!site) throw new Error("No site provided to the Valuation Engine.");

    const isRented = (site.contract_type || "").trim().toLowerCase() !== "owned";

    // Locked to the stable production model and forced into Strict JSON Mode
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: { responseMimeType: "application/json" },
    });

    const contentParts: any[] = [];
    const attachedDocNames: string[] = [];

    // Fetch and route any Lease Agreement documents through the File API to bypass memory limits
    if (isRented && Array.isArray(leaseDocs) && leaseDocs.length > 0) {
      for (const doc of leaseDocs) {
        if (!doc?.file_url) continue;
        try {
          const response = await fetch(doc.file_url);
          if (!response.ok) continue;
          
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mimeType = getMimeType(doc.file_name || "lease.pdf", doc.file_type);

          const safeName = (doc.file_name || "lease.pdf").replace(/[^a-zA-Z0-9.]/g, "_");
          const tempPath = path.join(os.tmpdir(), `val_${Date.now()}_${safeName}`);
          
          fs.writeFileSync(tempPath, buffer);
          tempFiles.push(tempPath);

          const uploadResult = await fileManager.uploadFile(tempPath, {
            mimeType: mimeType,
            displayName: doc.file_name || "Lease Agreement",
          });

          contentParts.push({
            fileData: {
              mimeType: uploadResult.file.mimeType,
              fileUri: uploadResult.file.uri,
            },
          });
          attachedDocNames.push(doc.file_name || "Lease Agreement");
        } catch (fetchErr) {
          console.error(`Failed to load lease document ${doc?.file_name}:`, fetchErr);
        }
      }
    }

    const leaseContextInstructions = isRented
      ? attachedDocNames.length > 0
        ? `
    ATTACHED LEASE AGREEMENT DOCUMENTS (${attachedDocNames.length}):
    - ${attachedDocNames.join("\n    - ")}

    CRITICAL INSTRUCTION FOR RENTED/LEASED ASSESSMENT:
    In addition to your complete macroeconomic and regional Fair Market Rent (FMR) valuation, you MUST thoroughly review the attached Lease Agreement document(s) and include a dedicated section titled "## Current Lease Agreement Review & Market Benchmarking".
    In that section, you must:
    1. Summarize the key financial and operational terms extracted from the attached lease agreement(s) (base rent, rent escalation/indexation mechanisms, CAM/operating expense structure, lease term/renewal options, maintenance/repair obligations, and any unusual financial liabilities or penalties).
    2. Directly benchmark the in-place lease agreement terms and current annual cost against prevailing regional market standards and your estimated Fair Market Rent (highlighting whether the tenant is paying above, below, or at market, and whether the contract structure is tenant-favorable, balanced, or landlord-favorable).
    3. Provide actionable commercial recommendations for upcoming lease management or renewal negotiations.`
        : `
    LEASE AGREEMENT DOCUMENTS:
    - No lease agreement documents were found in the site's Document Repository.
    - Note in a section titled "## Current Lease Agreement Review & Market Benchmarking" that no executed lease contract files were available in the repository for clause-level review, and base your benchmarking on the database's recorded lease metadata (Lease Start: ${site.lease_start || "N/A"}, Lease End: ${site.lease_end || "N/A"}, Annual Cost: ${site.annual_cost ? site.annual_cost + " " + site.local_currency : "N/A"}, Tenant: ${site.leaseholder || "N/A"}, Landlord: ${site.lease_owner || "N/A"}).`
      : "";

    const prompt = `You are a world-class commercial real estate valuation expert and corporate lease strategist.
    Analyze the following site and generate a comprehensive Fair Market Valuation (if Owned) or Fair Market Rent & Lease Assessment (if Rented/Leased).
    
    SITE DATA:
    - Code: ${site.site_code}
    - Name: ${site.common_name}
    - Location: ${site.street_address}, ${site.city}, ${site.state || ""} ${site.country}
    - Activity Type: ${site.activity_type}
    - Total Building Area: ${site.sqm_building || 0} sqm
    - Total Land Area: ${site.sqm_land || 0} sqm
    - Contract Type: ${site.contract_type}
    - Lease Start Date: ${site.lease_start || "N/A"}
    - Lease Expiration Date: ${site.lease_end || "N/A"}
    - Leaseholder (Tenant): ${site.leaseholder || "N/A"}
    - Lease Owner (Landlord): ${site.lease_owner || "N/A"}
    - Current Annual Cost: ${site.annual_cost ? site.annual_cost + " " + site.local_currency : "N/A"}
    - Local Currency: ${site.local_currency || "USD"}
    ${leaseContextInstructions}
    
    OUTPUT FORMAT (Strict JSON):
    {
      "confidence_rating": "High" | "Medium" | "Low",
      "confidence_explanation": "Provide a short 1-2 sentence explanation of why you selected this rating, citing data completeness, whether executed lease agreement documents were reviewed, location factors, and market predictability.",
      "assessment": "Write a comprehensive executive valuation report using standard Markdown (use ## for headings). Begin directly with ## Executive Summary, followed by ## Property Overview, ## Market Analysis, ${isRented ? "## Current Lease Agreement Review & Market Benchmarking, " : ""}## Valuation Methodology, and ## Valuation Conclusion. Do NOT include the confidence rating in this markdown.",
      "estimated_value": 1500000 // MUST be a raw Number in ${site.local_currency || "USD"}. Estimate a realistic annual Fair Market Rent (if Rented/Leased) or Capital Value (if Owned).
    }`;

    contentParts.push({ text: prompt });

    const result = await model.generateContent(contentParts);
    
    // Safely parse the JSON to strip out any hallucinated markdown wrappers
    const rawText = result.response.text() || "{}";
    const cleanedJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const jsonResponse = JSON.parse(cleanedJson);

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error("Valuation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    // Aggressively clean up temp files to prevent Edge storage limits
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