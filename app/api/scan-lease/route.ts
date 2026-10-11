import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");
    const mimeType = file.type || "application/pdf";

    const prompt = `
      You are an expert real estate lease analyst. Analyze this document (lease agreement, contract, or property document) and extract the following fields precisely. 
      Return ONLY a valid JSON object (no markdown formatting, no extra text) with these exact keys:
      {
        "site_code": "Generate a short code like EXT-001 or use document reference",
        "common_name": "Property or building name",
        "activity_type": "e.g. Warehouse, Office, Plant, Land, Retail",
        "divisional_belonging": "Business unit or division if mentioned, otherwise null",
        "legal_entity": "Legal entity owning or leasing, otherwise null",
        "status": "Operational",
        "jv_status": "No",
        "country": "Country name",
        "state": "State or province or null",
        "city": "City name",
        "street_address": "Street address",
        "zip_code": "Postal code",
        "latitude": null,
        "longitude": null,
        "sqm_land": null,
        "sqm_building": numeric value of building area in square meters or null,
        "contract_type": "Leased, Owned, or Rented",
        "leaseholder": "Tenant name",
        "lease_owner": "Landlord/Owner name",
        "lease_start": "YYYY-MM-DD or null",
        "lease_end": "YYYY-MM-DD or null",
        "annual_cost": numeric annual cost or null,
        "local_currency": "Three letter ISO currency code like USD, EUR, SEK, ZAR"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        { text: prompt },
      ],
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
    return NextResponse.json({ error: error.message || "Failed to process document" }, { status: 500 });
  }
}