// src/app/api/auth/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword, comparePassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    
    // A frontendből érkező adatok pontos beolvasása
    const { action, email, password, name } = await req.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: "Hiányzó e-mail cím vagy jelszó!" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // SZE Egyetemi domain szűrés
    if (!cleanEmail.endsWith("@sze.hu") && !cleanEmail.endsWith("@student.sze.hu")) {
      return NextResponse.json({ error: "Csak egyetemi e-mail cím engedélyezett!" }, { status: 400 });
    }

    let user = await User.findOne({ email: cleanEmail });

    if (action === "register") {
      if (user) {
        return NextResponse.json({ error: "Ez az e-mail cím már regisztrálva van!" }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json({ error: "Regisztrációhoz a név megadása kötelező!" }, { status: 400 });
      }

      // Jelszó hashelése regisztrációkor
      const hashedPassword = await hashPassword(password);
      user = await User.create({ name, email: cleanEmail, password: hashedPassword });
    } else {
      // Bejelentkezés ellenőrzése
      if (!user) {
        return NextResponse.json({ error: "Hibás e-mail cím vagy jelszó!" }, { status: 401 });
      }

      // Ellenőrizzük, hogy van-e elmentett jelszó (régi teszt userek kiszűrése)
      if (!user.password) {
        return NextResponse.json({ error: "A felhasználói fiók hibás. Kérjük, regisztrálj újra!" }, { status: 400 });
      }
      
      // Jelszó összehasonlítása Bcrypt-tel
      const isPasswordValid = await comparePassword(password, user.password);
      if (!isPasswordValid) {
        return NextResponse.json({ error: "Hibás e-mail cím vagy jelszó!" }, { status: 401 });
      }
    }

    // 5 percig élő, 6 jegyű numerikus TOTP kód generálása (0-9)
    let totpCode = "";
    for (let i = 0; i < 6; i++) {
      totpCode += Math.floor(Math.random() * 10).toString();
    }
    const expiresAt = Date.now() + 5 * 60 * 1000;

    // Csak a totp mezőt írjuk, a többi mező (securityEmail stb.) érintetlen marad
    await User.updateOne(
      { email: cleanEmail },
      { $set: { totp: { code: totpCode, expiresAt } } }
    );

    // Frissen olvassuk vissza a securityEmail beállításokat (lean = nyers DB adat)
    const freshUser = await User.findOne({ email: cleanEmail }).lean() as any;

    const totpEmailHtml = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0;">
        <h2 style="color: #004685; text-transform: uppercase;">Biztonsági kód</h2>
        <p>Kedves ${user.name || "Hallgató"}!</p>
        <p>A belépéshez vagy regisztrációhoz szükséges 6 számjegyű azonosító kódod:</p>
        <div style="background: #f4f4f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #1a1a1a; margin: 20px 0;">
          ${totpCode}
        </div>
        <p style="color: #ef4444; font-size: 12px;">A kód biztonsági okokból <strong>5 percig</strong> érvényes.</p>
        <hr style="border: none; border-top: 1px solid #f0f0f0; margin-top: 30px;" />
        <p style="font-size: 10px; color: #a1a1aa; text-align: center;">SZE-IVK Informatika Tanszék</p>
      </div>
    `;

    // Mindig kiküldjük az elsődleges (egyetemi) e-mailre
    await sendEmail({
      to: cleanEmail,
      subject: "SZE Digital Assistant - Kétlépcsős azonosító kód",
      html: totpEmailHtml,
    });

    // HA van biztonsági e-mail és engedélyezett, ugyanazt a kódot oda is kiküldjük
    if (freshUser?.securityEmail && freshUser?.securityEmailEnabled) {
      await sendEmail({
        to: freshUser.securityEmail,
        subject: "SZE Digital Assistant - Kétlépcsős azonosító kód",
        html: totpEmailHtml,
      }).catch(() => {});
    }

    return NextResponse.json({ 
      success: true, 
      message: "A biztonsági kódot elküldtük az e-mail címedre.",
      user: { email: user.email, name: user.name }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}