import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function getMimeType(file: File): string {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "txt" || ext === "csv") return "text/plain";
  if (file.type && file.type.includes("/")) return file.type;
  return "application/pdf";
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
      const mimeType = getMimeType(file);

      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
      fileNames.push(file.name);
    }

    const prompt = `You are a senior commercial real estate lease auditor and data extraction specialist.
You have been provided with ${filesToProcess.length} document(s): ${fileNames.join(", ")}.

CRITICAL INSTRUCTION — PERFORM A COMPLETE DEEP SCAN OF EVERY PAGE OF ALL ATTACHED DOCUMENTS:
Read every page, preamble, summary table, schedule, exhibit, addendum, amendment, and signature block across ALL provided documents.
If one document is a Master Lease and another is an Addendum, Amendment, or Renewal, synthesize them and ALWAYS use the most up-to-date amended figures.

FIELD EXTRACTION RULES:
- "site_code": Generate a logical site code based on country/city/activity (e.g., "US-DET-O" or "PL-KAT-W"), or use a property code if stated.
- "common_name": Name of the building, industrial park, office center, or "<City> <Activity>".
- "activity_type": MUST be one of: "Office", "Plant", "Plant On/In-site", "Warehouse", "Warehouse - 3rd Party", "Land", or "Other".
- "divisional_belonging": Business division if mentioned, otherwise "".
- "legal_entity": Full legal name of the Tenant company signing the lease.
- "status": "Operational".
- "jv_status": "No".
- "country": Full country name where the premises are located.
- "state": State, province, or region name, or "".
- "city": City or municipality of the leased premises.
- "street_address": Full street name and number of the leased premises.
- "zip_code": Postal or ZIP code of the leased premises.
- "latitude": Decimal latitude of the street address and city (estimate accurately if not explicitly written in the lease).
- "longitude": Decimal longitude of the street address and city (estimate accurately if not explicitly written in the lease).
- "sqm_building": Total rentable/leased building floor area in SQUARE METERS (numeric only). If stated in Square Feet (sq ft / RSF / SF), convert to Square Meters by dividing by 10.7639 and round to whole number.
- "sqm_land": Total land/plot area in square meters if stated, otherwise 0.
- "contract_type": "Rented/Leased" for leases, or "Owned" for title deeds.
- "leaseholder": Full legal name of the Tenant / Lessee.
- "lease_owner": Full legal name of the Landlord / Lessor / Owner.
- "lease_start": Lease Commencement Date formatted strictly as "YYYY-MM-DD".
- "lease_end": Lease Expiration Date formatted strictly as "YYYY-MM-DD".
- "annual_cost": Total current ANNUAL Base Rent as a raw number. If Monthly Rent is stated, multiply by 12. If rent is stated per sqm/month, multiply by sqm_building * 12. If rent is stated per sq ft/year, multiply by total sq ft.
- "local_currency": 3-letter ISO currency code used for rent (e.g., "USD", "EUR", "GBP", "SEK", "ZAR", "PLN").

Return ONLY a valid JSON object with those exact 23 keys.`;

    parts.push({ text: prompt });

    const result = await model.generateContent(parts);
    const rawText = result.response.text() || "{}";
    const cleanedJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const extractedData = JSON.parse(cleanedJson);

    return NextResponse.json({ success: true, data: extractedData });
  } catch (error: any) {
    console.error("AI Scan Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process documents" },
      { status: 500 }
    );
  }
}