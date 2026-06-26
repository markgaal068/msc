import { NextResponse } from "next/server";
import OpenAI from "openai";
import pdfParse from "pdf-parse";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "könnyű (alapfogalmak, definíciók)",
  medium: "közepes (összefüggések megértése, alkalmazás)",
  hard: "nehéz (elemzés, szintézis, értékelés)",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  essay: "Esszé kérdések (részletes kifejtést igénylő, min. fél oldalas válasz)",
  short: "Rövid kifejtős kérdések (2-5 mondatos válasz)",
  multiple: "Többválasztós kérdések (4 lehetséges válasz, 1 helyes)",
  truefalse: "Igaz/Hamis állítások (indoklással)",
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const settingsRaw = formData.get("settings") as string;

    if (!files.length) {
      return NextResponse.json({ error: "Nincs PDF fájl feltöltve" }, { status: 400 });
    }
    if (!settingsRaw) {
      return NextResponse.json({ error: "Hiányoznak a beállítások" }, { status: 400 });
    }

    const settings = JSON.parse(settingsRaw);
    const { testFileName, difficulty, taskTypes, questionCounts, includeScoring, includeAnswerKey } = settings;

    // Extract text from all PDFs
    const pdfTexts: string[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await pdfParse(buffer);
      if (parsed.text.trim()) {
        pdfTexts.push(`=== ${file.name} ===\n${parsed.text.trim()}`);
      }
    }

    if (!pdfTexts.length) {
      return NextResponse.json({ error: "A feltöltött PDF-ekből nem sikerült szöveget kinyerni" }, { status: 400 });
    }

    const combinedContent = pdfTexts.join("\n\n");
    const selectedTypes = taskTypes
      .map((t: string) => {
        const label = TASK_TYPE_LABELS[t];
        const count = (questionCounts as Record<string, number>)?.[t] ?? 5;
        return label ? `- ${count} db ${label}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const systemPrompt = `Te egy egyetemi oktató asszisztens vagy, aki tesztek generálásában segít.

SZIGORÚ SZABÁLYOK — ezektől nem térhetsz el:
1. KIZÁRÓLAG a megadott tananyagban (PDF-ek tartalmában) szereplő információkból generálj kérdéseket.
2. Minden kérdésre legyen egyértelmű, helyes válasz a tananyagban.
3. Ne találj ki, ne tegyél fel olyan kérdést, amire a válasz nem olvasható ki a forrásból.
4. PONTOSAN annyi kérdést generálj minden típusból, amennyit a beállítások meghatároznak.

FELADAT: Generálj egy tesztet a következő beállításokkal:
- Nehézség: ${DIFFICULTY_LABELS[difficulty] || difficulty}
- Feladattípusok és kérdésszámok:
${selectedTypes}
${includeScoring ? "- Adj pontozást minden feladathoz (pl. 2 pont, 5 pont stb.)" : ""}

Formázás: Markdown, feladattípusonként külön szekcióban (## fejléccel). A teszt tetején tüntesd fel a fájl nevét: "${testFileName}".`;

    const testResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `TANANYAG TARTALMA:\n\n${combinedContent}\n\n---\nGeneráld el a tesztet a fenti beállítások alapján, KIZÁRÓLAG a fenti tananyag alapján!`,
        },
      ],
      temperature: 0.3,
    });

    const testText = testResponse.choices[0].message.content ?? "";

    let answerKey: string | undefined;
    if (includeAnswerKey) {
      const answerKeyResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Te egy pontosan dolgozó megoldókulcs-készítő asszisztens vagy.
SZIGORÚ SZABÁLYOK:
1. A válaszok KIZÁRÓLAG a megadott tananyagon alapulhatnak.
2. Minden kérdésnél add meg a helyes választ és egy rövid magyarázatot, hogy hol található a válasz a forrásban.
3. Ne találj ki semmit, ami nincs a tananyagban.
Formázás: Markdown, ugyanolyan számozással mint a teszt.`,
          },
          {
            role: "user",
            content: `TANANYAG:\n\n${combinedContent}\n\n---\nTESZT, AMELYHEZ MEGOLDÓKULCSOT KELL KÉSZÍTENI:\n\n${testText}`,
          },
        ],
        temperature: 0.1,
      });
      answerKey = answerKeyResponse.choices[0].message.content ?? "";
    }

    return NextResponse.json({ test: testText, answerKey });
  } catch (error: any) {
    console.error("Teszt generálási hiba:", error);
    return NextResponse.json(
      { error: error.message || "Hiba a teszt generálása során" },
      { status: 500 }
    );
  }
}
