import mongoose, { Schema, model, models, Document } from "mongoose";

export interface IConversation extends Document {
  participants: string[];
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  { participants: [{ type: String, required: true, lowercase: true }] },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ConversationSchema.index({ participants: 1 });

export const Conversation = (
  models.Conversation || model<IConversation>("Conversation", ConversationSchema)
) as mongoose.Model<IConversation>;
