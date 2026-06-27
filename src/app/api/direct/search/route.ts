import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

// GET /api/direct/search?q=...&email=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q     = searchParams.get("q")?.trim();
  const email = searchParams.get("email")?.toLowerCase();

  if (!q || q.length < 2) return NextResponse.json({ users: [] });

  await connectToDatabase();
  const users = await User.find({
    name:  { $regex: q, $options: "i" },
    email: { $ne: email },
  })
    .select("name email avatar")
    .limit(10)
    .lean();

  return NextResponse.json({
    users: users.map(u => ({
      email:  (u as any).email,
      name:   (u as any).name,
      avatar: (u as any).avatar ?? null,
    })),
  });
}
