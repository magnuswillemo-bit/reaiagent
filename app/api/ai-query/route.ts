import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  try {
    const { prompt, history } = await req.json();

    // 1. Fetch live database context
    const { data: assets } = await supabase.from("assets").select("*").eq("status", "Operational");

    // 2. Define the strict AI Persona and Rules (Removed Mermaid requirements)
    const systemInstruction = `You are reAIgent, an elite enterprise real estate portfolio analyst.
    
CONTEXT:
You have direct access to the live corporate real estate database. Here is the current active portfolio data in JSON format:
${JSON.stringify(assets)}

RULES:
1. ALWAYS base your answers strictly on the provided portfolio data.
2. If asked for metrics, calculate them accurately from the raw data.
3. If asked to compare data, show a distribution, or visualize metrics, YOU MUST USE standard Markdown tables. Do NOT generate Mermaid.js blocks or ASCII charts.
4. If outputting a breakdown of categories, limit it to the top 10 categories to keep it readable.
5. Use clean markdown formatting to present financial breakdowns and highlight key insights.
6. Be highly professional, concise, and analytical in your tone.`;

    // 3. Initialize Gemini with the stable production model
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-pro-preview", 
      systemInstruction: systemInstruction 
    });

    const chat = model.startChat({
      history: history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      })),
    });

    const result = await chat.sendMessage(prompt);
    
    return NextResponse.json({ response: result.response.text() });
  } catch (error: any) {
    console.error("AI Query Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}