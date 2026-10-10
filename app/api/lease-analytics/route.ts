import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    // Support multiple files being passed in
    const fileUrls = formData.getAll("fileUrls[]") as string[];

    if (!fileUrls || fileUrls.length === 0) {
      return NextResponse.json({ error: "No document URLs provided" }, { status: 400 });
    }

    // Updated to the exact working model string used in the Valuation Tool
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are an expert commercial real estate attorney and lease analyst. 
    Review the following lease agreement(s) and any attached appendices. 
    Analyze the collective text and extract the intelligence strictly into the requested JSON schema.
    Generate exactly 15 key clauses (e.g., Rent Escalation, Maintenance, Assignment/Subletting, Termination, etc.).
    
    DOCUMENTS TO ANALYZE:
    ${fileUrls.join('\n')}

    OUTPUT JSON SCHEMA:
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
          "title": "Lease Term & Renewal Options",
          "extracted_terms": "string (what does the contract actually say)",
          "risk_analysis": "string (your expert opinion)",
          "risk_level": "High" | "Medium" | "Low"
        }
      ]
    }`;

    const result = await model.generateContent(prompt);
    const jsonResponse = JSON.parse(result.response.text());

    return NextResponse.json({ data: jsonResponse });

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}