// src/models/User.ts
import mongoose, { Schema, model, models, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  avatar: string | null;
  securityEmail: string | null;
  securityEmailEnabled: boolean;
  totp: {
    code: string | null;
    expiresAt: number | null;
  };
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  avatar: { type: String, default: null },
  securityEmail: { type: String, default: null },
  securityEmailEnabled: { type: Boolean, default: false },
  totp: {
    code: { type: String, default: null },
    expiresAt: { type: Number, default: null },
  }
}, { timestamps: true });

// Next.js specifikus export: ha már létezik a modell, azt használja, ha nem, létrehozza
export const User = (models.User || model<IUser>("User", UserSchema)) as mongoose.Model<IUser>;