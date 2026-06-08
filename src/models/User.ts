// src/models/User.ts
import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  totp: {
    code: { type: String, default: null },
    expiresAt: { type: Number, default: null },
  }
}, { timestamps: true });

// Next.js specifikus export: ha már létezik a modell, azt használja, ha nem, létrehozza
export const User = models.User || model("User", UserSchema);