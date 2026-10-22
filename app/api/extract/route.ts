import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { createClient } from "@supabase/supabase-js";
import os from "os";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || "");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: NextRequest) {
  let tempPath = "";
  
  try {
    // 1. Extract and validate the authorization token
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert the file to buffer and save to a temporary file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create a safe, unique temp file path
    tempPath = path.join(os.tmpdir(), `extract_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`);
    fs.writeFileSync(tempPath, buffer);

    // Upload to Google File API to bypass Next.js memory limits
    const uploadResult = await fileManager.uploadFile(tempPath, {
      mimeType: file.type || "application/pdf",
      displayName: file.name,
    });

    // Lock to the stable production model
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
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri,
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
  } finally {
    // Clean up the local temp file immediately to free space
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.error("Failed to clean up temp file:", tempPath, e);
      }
    }
  }
}