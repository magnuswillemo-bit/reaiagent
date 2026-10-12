import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function getMimeType(file: File): string {
  if (file.type && file.type.includes("/")) return file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "txt" || ext === "csv") return "text/plain";
  return "application/pdf";
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const multiFiles = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;

    const filesToProcess: File[] =
      multiFiles.length > 0
        ? multiFiles
        : singleFile
        ? [singleFile]
        : [];

    if (filesToProcess.length === 0) {
      return NextResponse.json({ error: "No documents uploaded" }, { status: 400 });
    }

    const contents: any[] = [];
    const fileNames: string[] = [];

    for (const file of filesToProcess) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64Data = buffer.toString("base64");
      const mimeType = getMimeType(file);

      contents.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
      fileNames.push(file.name);
    }

    const prompt = `
      You are an expert commercial real estate analyst. Analyze all ${filesToProcess.length} attached document(s) (${fileNames.join(", ")}) — which may include a master lease agreement, addendums, amendments, property deeds, or floorplans — and synthesize the information to extract the following fields precisely.
      If an addendum or newer amendment updates the rent, lease expiration date, or floor area from the original lease, always use the most current/updated figures.
      If latitude and longitude are not explicitly written in the documents, estimate accurate decimal coordinates based on the extracted street address, city, and country.
      
      Return ONLY a valid JSON object (no markdown formatting, no extra text) with these exact keys:
      {
        "site_code": "Generate a short code like EXT-001 or use document reference",
        "common_name": "Property or building name",
        "activity_type": "One of: Office, Plant, Plant On/In-site, Warehouse, Warehouse - 3rd Party, Land, Other",
        "divisional_belonging": "Business unit or division if mentioned, otherwise null",
        "legal_entity": "Legal entity owning or leasing, otherwise null",
        "status": "Operational",
        "jv_status": "No",
        "country": "Country name",
        "state": "State or province or null",
        "city": "City name",
        "street_address": "Street address",
        "zip_code": "Postal code",
        "latitude": numeric decimal latitude or null,
        "longitude": numeric decimal longitude or null,
        "sqm_land": numeric value of land area in square meters or null,
        "sqm_building": numeric value of building area in square meters or null,
        "contract_type": "Rented/Leased or Owned",
        "leaseholder": "Tenant name",
        "lease_owner": "Landlord/Owner name",
        "lease_start": "YYYY-MM-DD or null",
        "lease_end": "YYYY-MM-DD or null",
        "annual_cost": numeric annual cost or null,
        "local_currency": "Three letter ISO currency code like USD, EUR, SEK, ZAR, PLN"
      }
    `;

    contents.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text || "{}";
    const cleanedJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const extractedData = JSON.parse(cleanedJson);

    return NextResponse.json({ success: true, data: extractedData });
  } catch (error: any) {
    console.error("AI Scan Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process documents" }, { status: 500 });
  }
}