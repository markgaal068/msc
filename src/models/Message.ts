import mongoose, { Schema, model, models, Document } from "mongoose";

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderEmail: string;
  content: string;
  fileName: string | null;
  fileData: string | null;
  fileType: string | null;
  readBy: string[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderEmail:    { type: String, required: true, lowercase: true },
    content:        { type: String, default: "" },
    fileName:       { type: String, default: null },
    fileData:       { type: String, default: null },
    fileType:       { type: String, default: null },
    readBy:         [{ type: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Message = (
  models.Message || model<IMessage>("Message", MessageSchema)
) as mongoose.Model<IMessage>;
