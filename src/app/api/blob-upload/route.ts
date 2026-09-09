import { NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";

// Autorizálja a kliens oldali közvetlen feltöltést a Vercel Blob-ba, a Vercel
// OIDC-alapú (BLOB_STORE_ID + VERCEL_OIDC_TOKEN) hitelesítésével — ez a projekthez
// natívan kapcsolt Blob store módja, nincs statikus BLOB_READ_WRITE_TOKEN.
// Ez lehetővé teszi, hogy nagy PDF fájlok elkerüljék a Serverless Function
// ~4.5MB-os request body limitjét (413 Payload Too Large éles környezetben).
export async function POST(req: Request) {
  console.log(
    "[blob-upload] hasStoreId:", !!process.env.BLOB_STORE_ID,
    "hasOidcToken:", !!process.env.VERCEL_OIDC_TOKEN
  );

  try {
    const body = (await req.json()) as HandleUploadPresignedBody;

    const jsonResponse = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname) => {
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB / fájl
        });
        return {
          token,
          urlOptions: {
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({}),
          },
        };
      },
      onUploadCompleted: async () => {
        // A generate-test route törli a blob-ot feldolgozás után.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error("[blob-upload] hiba:", error);
    return NextResponse.json(
      { error: error.message || "Hiba a fájl feltöltése során" },
      { status: 400 }
    );
  }
}
