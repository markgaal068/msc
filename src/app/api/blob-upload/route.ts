import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Autorizálja a kliens oldali közvetlen feltöltést a Vercel Blob-ba.
// Ez lehetővé teszi, hogy nagy PDF fájlok elkerüljék a Serverless Function
// ~4.5MB-os request body limitjét (413 Payload Too Large éles környezetben).
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ["application/pdf"],
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB / fájl
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async () => {
        // A generate-test route törli a blob-ot feldolgozás után.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Hiba a fájl feltöltése során" },
      { status: 400 }
    );
  }
}
