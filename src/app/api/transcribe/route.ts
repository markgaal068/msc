import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nincs fájl feltöltve" }, { status: 400 });
    }

    // OpenAI Whisper hívás
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "hu",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (error: any) {
    console.error("Whisper hiba:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}