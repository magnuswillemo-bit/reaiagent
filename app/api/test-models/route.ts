import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    
    // Filter to only show the model names to make it easy to read
    const modelNames = data.models?.map((m: any) => m.name) || data;
    
    return NextResponse.json({ available_models: modelNames });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}