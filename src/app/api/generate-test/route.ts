import { NextResponse } from "next/server";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { del, get } from "@vercel/blob";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "könnyű (alapfogalmak, definíciók)",
  medium: "közepes (összefüggések megértése, alkalmazás)",
  hard: "nehéz (elemzés, szintézis, értékelés)",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  essay: "Esszé kérdések (részletes kifejtést igénylő, min. fél oldalas válasz)",
  short: "Rövid kifejtős kérdések (2-5 mondatos válasz)",
  multiple: "Többválasztós kérdések (4 lehetséges válasz, A–D jelöléssel; 1 VAGY TÖBB helyes is lehetséges a tananyag alapján — NE tüntesd fel a kérdésnél, hány helyes válasz van)",
  truefalse: "Igaz/Hamis állítások (CSAK az állítás szövege, NE kérj indoklást a hallgatótól)",
};

// Relatív "nehézségi" súlyok feladattípusonként — ez alapján osztjuk el arányosan
// az összpontszámot, hogy az esszé/rövid kifejtős kérdések többet érjenek, mint
// az igaz/hamis állítások.
const TYPE_SCORE_WEIGHTS: Record<string, number> = {
  truefalse: 1,
  multiple: 2,
  short: 3,
  essay: 5,
};

// Kiszámolja PONTOSAN maxScore összegre a pontszámokat kérdésenként, feladattípusonként,
// a legnagyobb maradék módszerével (largest remainder). Az LLM-re csak a kiszámolt
// értékek átmásolása marad — a puszta "oszd el arányosan" utasítás GPT-4o-val
// megbízhatatlanul összegződik és túllépi az összpontszámot.
function computeScoreDistribution(
  taskTypes: string[],
  questionCounts: Record<string, number>,
  maxScore: number
): Record<string, number[]> {
  const slots = taskTypes.flatMap(type => {
    const count = questionCounts?.[type] ?? 5;
    const weight = TYPE_SCORE_WEIGHTS[type] ?? 2;
    return Array.from({ length: count }, () => ({ type, weight }));
  });
  const n = slots.length;
  if (n === 0) return {};

  // Minden kérdés legalább 1 pontot kap, a maradékot súlyozottan osztjuk szét.
  const points = new Array(n).fill(1);
  const remaining = maxScore - n;
  if (remaining > 0) {
    const totalWeight = slots.reduce((s, sl) => s + sl.weight, 0);
    const raw = slots.map(sl => (remaining * sl.weight) / totalWeight);
    const floors = raw.map(Math.floor);
    floors.forEach((f, i) => { points[i] += f; });
    const allocated = floors.reduce((a, b) => a + b, 0);
    const leftover = remaining - allocated;
    const order = raw
      .map((v, i) => ({ i, frac: v - floors[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < leftover; k++) points[order[k % n].i] += 1;
  }

  const byType: Record<string, number[]> = {};
  slots.forEach((sl, i) => {
    (byType[sl.type] ??= []).push(points[i]);
  });
  return byType;
}

export async function POST(req: Request) {
  // A PDF-ek a kliensről közvetlenül a Vercel Blob-ba kerülnek feltöltésre,
  // ide csak a blob URL-ek érkeznek — így elkerüljük a Serverless Function
  // ~4.5MB-os request body limitjét (413 Payload Too Large éles környezetben).
  const uploadedBlobUrls: string[] = [];
  try {
    const body = await req.json();
    const files = (body.files as { url: string; name: string }[]) || [];
    const settings = body.settings;
    uploadedBlobUrls.push(...files.map(f => f.url));

    if (!files.length) {
      return NextResponse.json({ error: "Nincs PDF fájl feltöltve" }, { status: 400 });
    }
    if (!settings) {
      return NextResponse.json({ error: "Hiányoznak a beállítások" }, { status: 400 });
    }

    const { testFileName, difficulty, taskTypes, questionCounts, includeScoring, includeMaxScore, maxScore, includeAnswerKey, includeGift } = settings;
    const giftEligible = !!includeGift && (taskTypes as string[]).every((t: string) => t === "truefalse" || t === "multiple");

    // Extract text from all PDFs (letöltve a privát Blob store-ból, a szerver
    // Vercel OIDC hitelesítésével — BLOB_STORE_ID + VERCEL_OIDC_TOKEN)
    const pdfTexts: string[] = [];
    for (const file of files) {
      const result = await get(file.url, { access: "private" });
      if (!result || result.statusCode !== 200) continue;
      const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
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

    const totalQuestions = (taskTypes as string[]).reduce(
      (sum: number, t: string) => sum + ((questionCounts as Record<string, number>)?.[t] ?? 5),
      0
    );

    if (includeScoring && includeMaxScore) {
      if (!Number.isFinite(maxScore) || maxScore < totalQuestions) {
        return NextResponse.json(
          { error: `Az összpontszám (${maxScore}) túl alacsony: legalább ${totalQuestions} pontot kell megadni, hogy minden kérdés legalább 1 pontot érjen.` },
          { status: 400 }
        );
      }
    }

    let scoreInstructions = "";
    if (includeScoring && includeMaxScore) {
      const distribution = computeScoreDistribution(taskTypes, questionCounts, maxScore);
      const breakdown = (taskTypes as string[])
        .map((t: string) => {
          const label = TASK_TYPE_LABELS[t];
          const pts = distribution[t] || [];
          const perQuestion = pts.map((p, i) => `${i + 1}. kérdés = ${p} pont`).join(", ");
          const subtotal = pts.reduce((a, b) => a + b, 0);
          return label ? `  - ${label}: ${perQuestion} (részösszeg: ${subtotal} pont)` : null;
        })
        .filter(Boolean)
        .join("\n");
      scoreInstructions = `- Az összes feladatra összesen PONTOSAN ${maxScore} pontot kell adni. A pontszám-kiosztás KÖTELEZŐEN, VÁLTOZTATÁS NÉLKÜL a következő (ne számolj újra, ne oszd el másképp — kérdéstípuson belül sorrendben másold át ezeket az értékeket a megfelelő kérdésekhez):\n${breakdown}\n  A teszt tetején tüntesd fel: "Összpontszám: ${maxScore} pont".`;
    } else if (includeScoring) {
      scoreInstructions = "- Adj pontozást minden feladathoz.";
    }

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
${scoreInstructions}
${includeScoring ? `- PONTOZÁS ELHELYEZÉSE (KÖTELEZŐ): A pontszámot KÖZVETLENÜL a kérdés szövege után, a válaszlehetőségek ELŐTT tüntesd fel félkövéren, pl.: "1. Kérdés szövege? **(2 pont)**". NE az utolsó válaszlehetőség után szerepeljen!` : ""}

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
            content: `Te egy részletes megoldókulcsot készítő asszisztens vagy.
SZABÁLYOK:
1. A válaszok KIZÁRÓLAG a megadott tananyagon alapulhatnak.
2. Minden kérdésnél add meg:
   - A helyes válasz(ok)at egyértelműen kiemelve (félkövéren)
   - Többválasztósoknál: jelöld meg melyik betű(k) helyes(ek) és hány helyes válasz volt összesen
   - Igaz/Hamis kérdéseknél: a helyes megoldás (Igaz/Hamis) + rövid indoklás a tananyag alapján
   - Rövid magyarázatot, hogy miért helyes és hol található a forrásban
   - Ha a tesztben pontozás szerepelt: tüntesd fel az adott kérdés pontszámát
   - ESSZÉ és RÖVID KIFEJTŐS kérdéseknél KÖTELEZŐ részpontozási séma: részletezd, hogy a teljes pontszám hogyan osztható fel szempontok szerint (pl. "1 pont: a fogalom helyes meghatározása — 1 pont: az összefüggés kifejtése — 1 pont: konkrét példa vagy hivatkozás"). Ha nincs megadott pontszám, akkor is adj javasolt részpontozást.
3. Ne találj ki semmit, ami nincs a tananyagban.
Formázás: Markdown, ugyanolyan fejlécekkel és számozással mint a teszt. Minden kérdésnél a helyes megoldást jól elkülönítve, jól olvashatóan add meg.`,
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
  } finally {
    // A feltöltött PDF-ek a feldolgozás után nincsenek tovább szükségesek a Blob store-ban.
    if (uploadedBlobUrls.length) {
      del(uploadedBlobUrls).catch(err => console.error("Blob törlési hiba:", err));
    }
  }
}
