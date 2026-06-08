// src/lib/db.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Kérlek definiáld a MONGODB_URI környezeti változót a .env.local fájlban!");
}

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!).then((m) => m);
  }
  
  cached.conn = await cached.promise;
  return cached.conn;
}