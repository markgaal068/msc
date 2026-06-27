import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Typing } from "@/models/Typing";

// POST — set "I am typing"
export async function POST(req: Request) {
  const { conversationId, email } = await req.json();
  if (!conversationId || !email) return NextResponse.json({ ok: false });

  await connectToDatabase();
  await Typing.findOneAndUpdate(
    { conversationId, userEmail: email.toLowerCase() },
    { updatedAt: new Date() },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}

// GET — is the other user typing?
// /api/direct/typing?convId=...&email=... (email = ME, returns whether OTHER is typing)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const convId = searchParams.get("convId");
  const email  = searchParams.get("email")?.toLowerCase();
  if (!convId || !email) return NextResponse.json({ typing: false });

  await connectToDatabase();
  const cutoff = new Date(Date.now() - 3000);
  const record = await Typing.findOne({
    conversationId: convId,
    userEmail:      { $ne: email },
    updatedAt:      { $gte: cutoff },
  });
  return NextResponse.json({ typing: !!record });
}
