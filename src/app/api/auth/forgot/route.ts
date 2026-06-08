// src/app/api/auth/forgot/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { email } = await req.json();

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: "Ez az e-mail cím nem szerepel a rendszerben!" }, { status: 404 });
    }

    // 8 karakteres véletlenszerű ideiglenes jelszó generálása
    const tempPassword = Math.floor(10000000 + Math.random() * 90000000).toString();
    
    // Új Bcrypt hashelt jelszó mentése
    user.password = await hashPassword(tempPassword);
    await user.save();

    // Kiküldés Nodemailer-rel
    await sendEmail({
      to: user.email,
      subject: "SZE Digital Assistant - Ideiglenes jelszó",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0;">
          <h2 style="color: #004685;">Ideiglenes jelszó generálva</h2>
          <p>Kérésedre a rendszer egy új ideiglenes jelszót generált a fiókodhoz:</p>
          <div style="background: #eff6ff; padding: 15px; text-align: center; font-size: 18px; font-weight: bold; color: #004685; margin: 20px 0; border: 1px dashed #004685;">
            ${tempPassword}
          </div>
          <p>Kérjük, belépés után azonnal változtasd meg a jelszavadat a biztonságod érdekében!</p>
        </div>
      `
    });

    return NextResponse.json({ success: true, message: "Az új ideiglenes jelszót kiküldtük e-mailben!" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}