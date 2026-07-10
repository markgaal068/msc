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
  multiple: "Többválasztós kérdések (4 lehetséges válasz, 1 VAGY TÖBB helyes is lehetséges — a tananyag alapján döntsd el; minden kérdésnél jelöld meg, hány helyes válasz van)",
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
    const { testFileName, difficulty, taskTypes, questionCounts, includeScoring, includeMaxScore, maxScore, includeAnswerKey, includeGift } = settings;
    const giftEligible = !!includeGift && (taskTypes as string[]).every((t: string) => t === "truefalse" || t === "multiple");

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

    const giftInstructions = giftEligible ? `

MOODLE GIFT EXPORTÁLÁS:
A Markdown teszt után add meg ugyanezt GIFT formátumban is, PONTOSAN ebben a struktúrában (ne hagyj ki egyetlen kérdést sem):

---GIFT FORMAT---
$CATEGORY: ${testFileName}

// question: 1  name: 01
// Példa: 1 helyes válasz (helyes: 100%; helytelen: -100%)
::01::Kérdés szövege?{
\t~%100%Helyes válasz
\t~%-100%Helytelen válasz 1
\t~%-100%Helytelen válasz 2
\t~%-100%Helytelen válasz 3
}

// question: 2  name: 02
// Példa: 2 helyes válasz (mindkettő 50%-ot ér, összesen 100%; helytelen: -100%)
::02::Kérdés szövege?{
\t~%50%Helyes válasz 1
\t~%50%Helyes válasz 2
\t~%-100%Helytelen válasz 1
\t~%-100%Helytelen válasz 2
}

// question: 3  name: 03
// Példa: igaz-hamis
::03::Állítás szövege.{TRUE}

---END GIFT---

GIFT PONTOZÁSI SZABÁLYOK (KÖTELEZŐ BETARTANI):
1. Ha 1 helyes válasz van: = jelöli a helyes választ (100%), ~%-100%Szöveg a helytelent
2. Ha N > 1 helyes válasz van: minden helyes válasz ~%(100/N)% formátummal (pl. 2 helyes → ~%50%, 3 helyes → ~%33.33333%)
3. Helytelen válasz MINDIG ~%-100%Szöveg (minden rossz válasz -100% büntetést kap)
4. Az összes helyes válasz %-ának összege pontosan 100% legyen
5. Igaz-hamisnál: {TRUE} ha igaz, {FALSE} ha hamis
6. Ne használj HTML tageket
7. Pontosan azonosítsd a helyes válasz(ok)at a tananyag alapján
8. Számozás: 01, 02, 03...
9. Csak a GIFT szöveget add meg a jelölők között, semmi mást!` : "";

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
${includeScoring && includeMaxScore
  ? `- Az összes feladatra összesen pontosan ${maxScore} pontot ossz el arányosan a feladatok nehézsége és típusa szerint. Minden feladatnál tüntesd fel az adott pontszámot zárójelben. A teszt tetején tüntesd fel: "Összpontszám: ${maxScore} pont".`
  : includeScoring
  ? "- Adj pontozást minden feladathoz (pl. 2 pont, 5 pont stb.)"
  : ""}

Formázás: Markdown, feladattípusonként külön szekcióban (## fejléccel). A teszt tetején tüntesd fel a fájl nevét: "${testFileName}".${giftInstructions}`;

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

    let testText = testResponse.choices[0].message.content ?? "";
    let gift: string | undefined;

    if (giftEligible) {
      const giftStart = testText.indexOf("---GIFT FORMAT---");
      const giftEnd   = testText.indexOf("---END GIFT---");
      if (giftStart !== -1 && giftEnd !== -1) {
        gift     = testText.slice(giftStart + "---GIFT FORMAT---".length, giftEnd).trim();
        testText = testText.slice(0, giftStart).trim();
      }
    }

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

    return NextResponse.json({ test: testText, answerKey, gift });
  } catch (error: any) {
    console.error("Teszt generálási hiba:", error);
    return NextResponse.json(
      { error: error.message || "Hiba a teszt generálása során" },
      { status: 500 }
    );
  }
}
