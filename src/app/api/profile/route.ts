import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword, comparePassword } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Hiányzó e-mail" }, { status: 400 });

  await connectToDatabase();
  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) return NextResponse.json({ error: "Felhasználó nem található" }, { status: 404 });

  return NextResponse.json({
    avatar: (user as any).avatar ?? null,
    securityEmail: (user as any).securityEmail ?? null,
    securityEmailEnabled: (user as any).securityEmailEnabled ?? false,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { email, action } = body;
  if (!email || !action) return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });

  await connectToDatabase();
  const cleanEmail = email.toLowerCase();

  if (action === "avatar") {
    const { avatar } = body;
    if (!avatar) return NextResponse.json({ error: "Hiányzó avatar" }, { status: 400 });
    const result = await User.updateOne({ email: cleanEmail }, { $set: { avatar } });
    if (result.matchedCount === 0) return NextResponse.json({ error: "Felhasználó nem található" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  if (action === "password") {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword)
      return NextResponse.json({ error: "Hiányzó jelszó adatok" }, { status: 400 });
    if (newPassword.length < 6)
      return NextResponse.json({ error: "Az új jelszónak legalább 6 karakter hosszúnak kell lennie." }, { status: 400 });

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return NextResponse.json({ error: "Felhasználó nem található" }, { status: 404 });

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) return NextResponse.json({ error: "Hibás jelenlegi jelszó!" }, { status: 400 });

    await User.updateOne({ email: cleanEmail }, { $set: { password: await hashPassword(newPassword) } });
    return NextResponse.json({ success: true });
  }

  if (action === "securityEmail") {
    const { securityEmail, securityEmailEnabled } = body;
    const result = await User.updateOne(
      { email: cleanEmail },
      { $set: { securityEmail: securityEmail?.trim() || null, securityEmailEnabled: !!securityEmailEnabled } }
    );
    if (result.matchedCount === 0) return NextResponse.json({ error: "Felhasználó nem található" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Ismeretlen művelet" }, { status: 400 });
}
