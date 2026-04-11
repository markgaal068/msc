import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, type } = await req.json();

    let systemPrompt = "";
    
    if (type === "faq") {
      systemPrompt = "Te egy egyetemi oktatási asszisztens vagy. A megadott hallgatói levelek alapján készíts egy strukturált FAQ listát Markdown formátumban. Használj félkövér kiemelést a kérdésekhez és pontokba szedett válaszokat.";
    } else if (type === "wellbeing") {
      systemPrompt = "Pszichológiai szakértő vagy, aki oktatóknak segít. Elemezd a naplóbejegyzést. Adj rövid, maximum 3-4 mondatos támogató reflexiót. Ha stresszre vagy kiégésre utaló jelet látsz, adj egy apró tanácsot is.";
    } else {
      systemPrompt = "Te egy jegyzetelő asszisztens vagy.";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Vagy "gpt-3.5-turbo" ha olcsóbbat szeretnél
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
    });

    return NextResponse.json({ text: response.choices[0].message.content });
  } catch (error: any) {
    console.error("OpenAI Hiba:", error);
    return NextResponse.json({ error: error.message || "Hiba az AI hívás során" }, { status: 500 });
  }
}