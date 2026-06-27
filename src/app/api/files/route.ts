import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { SavedFile } from "@/models/SavedFile";

// GET /api/files?email=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Hiányzó e-mail" }, { status: 400 });

  await connectToDatabase();
  const files = await SavedFile.find({ userEmail: email.toLowerCase() })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ files });
}

// POST /api/files  — save a new file
export async function POST(req: Request) {
  const body = await req.json();
  const { userEmail, name, type, content } = body;

  if (!userEmail || !name || !type || !content)
    return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });

  await connectToDatabase();
  const file = await SavedFile.create({
    userEmail: userEmail.toLowerCase(),
    name:      name.trim(),
    type,
    content,
  });

  return NextResponse.json({ file }, { status: 201 });
}

// DELETE /api/files?id=...&email=...
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id    = searchParams.get("id");
  const email = searchParams.get("email");

  if (!id || !email) return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });

  await connectToDatabase();
  const result = await SavedFile.deleteOne({ _id: id, userEmail: email.toLowerCase() });

  if (result.deletedCount === 0)
    return NextResponse.json({ error: "Fájl nem található" }, { status: 404 });

  return NextResponse.json({ success: true });
}
