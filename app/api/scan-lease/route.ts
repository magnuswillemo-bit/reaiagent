import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function getSupportedMimeType(file: File): string {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "txt" || ext === "csv") return "text/plain";
  return "application/pdf";
}

// Guarantees that whether Gemini returns [{...}], { data: {...} }, { site: {...} }, or UpperCase keys,
// we always extract and merge into a single flat object with the exact 23 expected keys.
function normalizeExtractedObject(parsed: any): Record<string, any> {
  if (!parsed) return {};

  // If Gemini returned an array of objects (e.g. one per document), merge them so later docs (addendums) override earlier ones
  if (Array.isArray(parsed)) {
    const merged: Record<string, any> = {};
    for (const item of parsed) {
      if (item && typeof item === "object") {
        for (const [k, v] of Object.entries(item)) {
          if (v !== null && v !== undefined && v !== "" && v !== "null" && v !== "N/A") {
            merged[k.toLowerCase().trim()] = v;
          }
        }
      }
    }
    return merged;
  }

  // If Gemini nested the response inside a wrapper key like { site_data: {...} } or { properties: {...} }
  if (typeof parsed === "object") {
    const keys = Object.keys(parsed);
    if (
      keys.length === 1 &&
      parsed[keys[0]] &&
      typeof parsed[keys[0]] === "object"
    ) {
      return normalizeExtractedObject(parsed[keys[0]]);
    }

    const normalized: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== "null" && v !== "N/A") {
        normalized[k.toLowerCase().trim()] = v;
      }
    }
    return normalized;
  }

  return {};
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const multiFiles = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;

    const filesToProcess: File[] =
      multiFiles.length > 0 ? multiFiles : singleFile ? [singleFile] : [];

    if (filesToProcess.length === 0) {
      return NextResponse.json({ error: "No documents uploaded" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parts: any[] = [];
    const fileNames: string[] = [];

    for (const file of filesToProcess) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64Data = buffer.toString("base64");
      const mimeType = getSupportedMimeType(file);

      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
      fileNames.push(file.name);
    }

    const prompt = `You are a senior commercial real estate lease auditor and data extraction specialist.
Analyze the ${filesToProcess.length} attached lease/property document(s) (${fileNames.join(", ")}) and synthesize all information into a SINGLE flat JSON object (DO NOT return a JSON array).

If multiple documents are provided (such as a Master Lease and an Amendment/Addendum), merge the data and use the most current/amended figures for rent, lease dates, and floor area.

EXTRACT THESE EXACT 23 KEYS INTO A SINGLE FLAT JSON OBJECT:
{
  "site_code": "Logical code based on Country-City-Activity (e.g. US-DET-O or ZA-CPT-W) or contract ref",
  "common_name": "Building name, industrial park name, or '<City> <Activity>'",
  "activity_type": "Must be one of: Office, Plant, Plant On/In-site, Warehouse, Warehouse - 3rd Party, Land, Other",
  "divisional_belonging": "Business division if stated, otherwise empty string",
  "legal_entity": "Full legal name of the Tenant company signing the lease",
  "status": "Operational",
  "jv_status": "No",
  "country": "Full country name where the property is located",
  "state": "State, province, or region name (or empty string)",
  "city": "City name where the property is located",
  "street_address": "Street address of the leased premises",
  "zip_code": "Postal or ZIP code of the leased premises",
  "latitude": 0.0,
  "longitude": 0.0,
  "sqm_land": 0,
  "sqm_building": 0,
  "contract_type": "Rented/Leased",
  "leaseholder": "Full legal name of the Tenant / Lessee",
  "lease_owner": "Full legal name of the Landlord / Lessor / Owner",
  "lease_start": "YYYY-MM-DD",
  "lease_end": "YYYY-MM-DD",
  "annual_cost": 0,
  "local_currency": "3-letter ISO currency code (e.g. USD, EUR, SEK, ZAR, GBP, PLN)"
}

IMPORTANT CALCULATION RULES:
1. "sqm_building": Total leased building area in SQUARE METERS (number only). If the contract states Square Feet (sq ft / SF / RSF), divide by 10.7639 and round to a whole number.
2. "annual_cost": Total ANNUAL base rent (number only, no commas or currency symbols).
   - If the contract states Monthly rent, multiply by 12.
   - If the contract states rate per sqm per month, multiply by sqm_building * 12.
   - If the contract states rate per sq ft per year, multiply by total sq ft.
3. "latitude" & "longitude": Estimate accurate decimal coordinates for the extracted street_address, city, and country.
4. "lease_start" & "lease_end": Must be formatted as YYYY-MM-DD.`;

    parts.push({ text: prompt });

    const result = await model.generateContent(parts);
    const rawText = result.response.text() || "{}";
    const cleanedJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsedJson = JSON.parse(cleanedJson);
    const extractedData = normalizeExtractedObject(parsedJson);

    return NextResponse.json({
      success: true,
      data: extractedData,
    });
  } catch (error: any) {
    console.error("AI Scan Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process documents" },
      { status: 500 }
    );
  }
}