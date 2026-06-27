import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";
import { User } from "@/models/User";

// GET /api/direct/conversations?email=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Hiányzó e-mail" }, { status: 400 });

  await connectToDatabase();

  const me = await User.findOne({ email }).select("favorites").lean();
  const myFavorites: string[] = (me as any)?.favorites ?? [];

  const convos = await Conversation.find({ participants: email }).lean();

  const enriched = await Promise.all(
    convos.map(async (conv) => {
      const otherEmail = conv.participants.find((p) => p !== email) ?? "";
      const [otherUser, lastMessage, unreadCount] = await Promise.all([
        User.findOne({ email: otherEmail }).select("name avatar").lean(),
        Message.findOne({ conversationId: conv._id }).sort({ createdAt: -1 }).lean(),
        Message.countDocuments({ conversationId: conv._id, readBy: { $ne: email } }),
      ]);
      return {
        _id:       conv._id.toString(),
        otherUser: {
          email:  otherEmail,
          name:   (otherUser as any)?.name ?? otherEmail,
          avatar: (otherUser as any)?.avatar ?? null,
        },
        lastMessage: lastMessage
          ? {
              content:     (lastMessage as any).content,
              senderEmail: (lastMessage as any).senderEmail,
              createdAt:   (lastMessage as any).createdAt,
            }
          : null,
        unreadCount,
        isFavorite: myFavorites.includes(otherEmail),
      };
    })
  );

  // Sort: favorites first, then by last message date
  enriched.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    const aDate = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bDate = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bDate - aDate;
  });

  const total = enriched.reduce((s, c) => s + c.unreadCount, 0);
  return NextResponse.json({ conversations: enriched, total });
}

// POST /api/direct/conversations — start or get existing conversation
export async function POST(req: Request) {
  const { from, to } = await req.json();
  if (!from || !to) return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });

  await connectToDatabase();
  const sorted = [from.toLowerCase(), to.toLowerCase()].sort();

  let conv = await Conversation.findOne({ participants: { $all: sorted, $size: 2 } });
  if (!conv) conv = await Conversation.create({ participants: sorted });

  return NextResponse.json({ conversationId: conv._id.toString() });
}
