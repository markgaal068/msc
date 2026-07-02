import mongoose, { Schema, model, models, Document } from "mongoose";

export type FileType = "faq" | "reflexio" | "hangjegyzet" | "teszt" | "megoldokulcs" | "moodle";

export interface ISavedFile extends Document {
  userEmail: string;
  name: string;
  type: FileType;
  content: string;
  createdAt: Date;
}

const SavedFileSchema = new Schema<ISavedFile>(
  {
    userEmail: { type: String, required: true, index: true, lowercase: true },
    name:      { type: String, required: true, trim: true, maxlength: 120 },
    type:      { type: String, required: true, enum: ["faq", "reflexio", "hangjegyzet", "teszt", "megoldokulcs", "moodle"] },
    content:   { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const SavedFile = (models.SavedFile || model<ISavedFile>("SavedFile", SavedFileSchema)) as mongoose.Model<ISavedFile>;
