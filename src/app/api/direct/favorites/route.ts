import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

// PATCH — toggle favorite
// Body: { userEmail, targetEmail }
export async function PATCH(req: Request) {
  const { userEmail, targetEmail } = await req.json();
  if (!userEmail || !targetEmail)
    return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });

  await connectToDatabase();
  const user = await User.findOne({ email: userEmail.toLowerCase() });
  if (!user) return NextResponse.json({ error: "Felhasználó nem található" }, { status: 404 });

  const favs: string[] = (user as any).favorites ?? [];
  const target = targetEmail.toLowerCase();
  const isFav  = favs.includes(target);

  await User.updateOne(
    { email: userEmail.toLowerCase() },
    isFav ? { $pull: { favorites: target } } : { $addToSet: { favorites: target } }
  );

  return NextResponse.json({ isFavorite: !isFav });
}
