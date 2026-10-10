import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { site } = await req.json();

    if (!site) throw new Error("No site provided to the Valuation Engine.");

    // Force Gemini into Strict JSON Mode
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-pro-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are a world-class commercial real estate valuation expert.
    Analyze the following site and generate a Fair Market Valuation (if Owned) or Fair Market Rent (if Rented/Leased).
    
    SITE DATA:
    - Code: ${site.site_code}
    - Name: ${site.common_name}
    - Location: ${site.street_address}, ${site.city}, ${site.country}
    - Activity Type: ${site.activity_type}
    - Total Building Area: ${site.sqm_building || 0} sqm
    - Total Land Area: ${site.sqm_land || 0} sqm
    - Contract Type: ${site.contract_type}
    - Current Annual Cost: ${site.annual_cost ? site.annual_cost + ' ' + site.local_currency : 'N/A'}
    
    OUTPUT FORMAT (Strict JSON):
    {
      "confidence_rating": "High" | "Medium" | "Low",
      "confidence_explanation": "Provide a short 1-2 sentence explanation of why you selected this rating, citing data completeness, location factors, or market predictability.",
      "assessment": "Write a comprehensive executive valuation report using standard Markdown (use ## for headings). Begin directly with an Executive Summary. Do NOT include the confidence rating in this markdown.",
      "estimated_value": 1500000 // MUST be a raw Number. Estimate a realistic annual rent or capital value.
    }`;

    const result = await model.generateContent(prompt);
    const jsonResponse = JSON.parse(result.response.text());

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error("Valuation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}