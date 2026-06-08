// src/app/api/auth/verify/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    
    // Beolvassuk a frontend által küldött adatokat
    const { email, code } = await req.json();
    const cleanEmail = email.trim().toLowerCase();

    // Megkeressük a felhasználót az adatbázisban
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return NextResponse.json({ error: "Felhasználó nem található!" }, { status: 404 });
    }

    // Ellenőrizzük, hogy létezik-e egyáltalant generált TOTP kód a felhasználóhoz
    if (!user.totp || !user.totp.code) {
      return NextResponse.json({ error: "Nincs aktív hitelesítési munkamenet. Kérj új kódot!" }, { status: 400 });
    }

    // 1. ELLENŐRZÉS: Lejárt-e az 5 perc?
    if (Date.now() > user.totp.expiresAt) {
      return NextResponse.json({ error: "A biztonsági kód időtartama (5 perc) lejárt! Kérj új kódot." }, { status: 400 });
    }

    // 2. ELLENŐRZÉS: Egyezik-e a beírt kód a generálttal?
    if (user.totp.code !== code.trim()) {
      return NextResponse.json({ error: "A megadott biztonsági kód hibás!" }, { status: 400 });
    }

    // Sikeres azonosítás: Töröljük a használt TOTP kódot a biztonság kedvéért
    user.totp = undefined;
    await user.save();

    // Visszaküldjük a sikeres választ a frontendnek a dashboard belépéshez
    return NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}