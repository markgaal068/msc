// src/lib/auth.ts
import bcrypt from "bcryptjs";

// Jelszó biztonságos hashelése regisztrációkor (automatikus sózással)
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

// Jelszó ellenőrzése bejelentkezéskor
export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  if (!password || !hashed) return false;
  return await bcrypt.compare(password, hashed);
}