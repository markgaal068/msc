import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Message } from "@/models/Message";
import mongoose from "mongoose";

// GET /api/direct/conversations/[id]?email=...
// Returns last 60 messages and marks unread ones as read for the requesting user
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Hiányzó e-mail" }, { status: 400 });

  await connectToDatabase();
  const convId = new mongoose.Types.ObjectId(id);

  // Mark unread messages as read
  await Message.updateMany(
    { conversationId: convId, readBy: { $ne: email } },
    { $addToSet: { readBy: email } }
  );

  const messages = await Message.find({ conversationId: convId })
    .sort({ createdAt: 1 })
    .limit(60)
    .lean();

  return NextResponse.json({
    messages: messages.map((m) => ({
      _id:         (m as any)._id.toString(),
      senderEmail: (m as any).senderEmail,
      content:     (m as any).content,
      fileName:    (m as any).fileName,
      fileData:    (m as any).fileData,
      fileType:    (m as any).fileType,
      readBy:      (m as any).readBy,
      createdAt:   (m as any).createdAt,
    })),
  });
}

// POST /api/direct/conversations/[id] — send a message
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { senderEmail, content, fileName, fileData, fileType } = body;

  if (!senderEmail) return NextResponse.json({ error: "Hiányzó feladó" }, { status: 400 });
  if (!content?.trim() && !fileData) return NextResponse.json({ error: "Üres üzenet" }, { status: 400 });
  if (fileData && fileData.length > 700_000)
    return NextResponse.json({ error: "A fájl mérete maximum 500KB lehet." }, { status: 400 });

  await connectToDatabase();
  const msg = await Message.create({
    conversationId: new mongoose.Types.ObjectId(id),
    senderEmail:    senderEmail.toLowerCase(),
    content:        content?.trim() ?? "",
    fileName:       fileName ?? null,
    fileData:       fileData ?? null,
    fileType:       fileType ?? null,
    readBy:         [senderEmail.toLowerCase()],
  });

  return NextResponse.json({
    message: {
      _id:         msg._id.toString(),
      senderEmail: msg.senderEmail,
      content:     msg.content,
      fileName:    msg.fileName,
      fileData:    msg.fileData,
      fileType:    msg.fileType,
      readBy:      msg.readBy,
      createdAt:   msg.createdAt,
    },
  }, { status: 201 });
}
