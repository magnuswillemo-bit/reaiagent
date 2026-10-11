import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert the file to a base64 buffer for Gemini
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // Updated to Gemini 3.1 Pro Preview with strict JSON output mode
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-pro-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      You are an expert real estate lease abstraction AI.
      Analyze the attached document (which could be a lease agreement, property sheet, or invoice).
      Extract the following data points into a strict JSON object. 
      If a specific data point is missing from the document, return null for that field.

      Required JSON structure:
      {
        "site_code": "string or null",
        "common_name": "string or null",
        "activity_type": "string or null",
        "divisional_belonging": "string or null",
        "legal_entity": "string or null",
        "country": "string or null",
        "state": "string or null",
        "city": "string or null",
        "street_address": "string or null",
        "zip_code": "string or null",
        "sqm_building": "extract number only or null",
        "sqm_land": "extract number only or null",
        "contract_type": "Leased or Owned or Rented",
        "leaseholder": "tenant name or null",
        "lease_owner": "landlord name or null",
        "lease_start": "YYYY-MM-DD format or null",
        "lease_end": "YYYY-MM-DD format or null",
        "annual_cost": "extract number only or null",
        "local_currency": "3-letter ISO code like USD, EUR, SEK or null"
      }
      
      Respond ONLY with the raw, valid JSON object. Do not wrap it in markdown blockquotes like \`\`\`json.
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: file.type || "application/pdf",
        },
      },
    ]);

    const responseText = result.response.text();
    
    // Clean the response just in case the LLM adds markdown formatting
    const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const extractedData = JSON.parse(cleanJson);

    return NextResponse.json(extractedData);
  } catch (error) {
    console.error("AI Extraction Error:", error);
    return NextResponse.json({ error: "Failed to extract data from document" }, { status: 500 });
  }
}