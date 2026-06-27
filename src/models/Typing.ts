import mongoose, { Schema, model, models, Document } from "mongoose";

export interface ITyping extends Document {
  conversationId: string;
  userEmail: string;
  updatedAt: Date;
}

const TypingSchema = new Schema<ITyping>({
  conversationId: { type: String, required: true },
  userEmail:      { type: String, required: true, lowercase: true },
  updatedAt:      { type: Date, default: Date.now },
});
TypingSchema.index({ conversationId: 1, userEmail: 1 }, { unique: true });

export const Typing = (
  models.Typing || model<ITyping>("Typing", TypingSchema)
) as mongoose.Model<ITyping>;
