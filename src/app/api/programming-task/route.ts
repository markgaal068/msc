import { NextResponse } from "next/server";
import OpenAI from "openai";
import { runProgram, type RunLanguage } from "@/lib/judge";

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Language = RunLanguage;
type Difficulty = "easy" | "medium" | "hard";

const LANGUAGES: Record<Language, { label: string; prompt: string; coderunner: string }> = {
  python: { label: "Python", prompt: "Python 3", coderunner: "python3" },
  cpp: { label: "C++", prompt: "C++17", coderunner: "cpp" },
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Könnyű",
  medium: "Közepes",
  hard: "Nehéz",
};

const QUESTION_COUNT = 5;
const MAX_ATTEMPTS = 3;
const TESTS_PER_QUESTION = 4;

// Az 5 feladat nehézségi profilja — ugyanez az alak minden szinten (a sorrend és az arányok nem változnak),
// csak az abszolút nehézség. Hard szinten a 3. feladat a referencia-minta szintje (kb. 18 perc).
const SLOT_PROFILES: Record<Difficulty, string[]> = {
  hard: [
    "LEGKÖNNYEBB a sorban (kb. 8 perc): átlátható, komplex program, egy-két számítási lépéssel",
    "KICSIT KÖNNYEBB, mint a minta (kb. 14 perc): több lépés, egymásba ágyazott feltételek vagy ciklusok",
    "A MINTA SZINTJE (kb. 18 perc): többlépéses algoritmus, képletek (pl. geometria, fizika, statisztika), állapotkezelés",
    "KICSIT NEHEZEBB, mint a minta (kb. 22 perc): több részfeladat, adatszerkezetek, numerikus pontosság",
    "LEGNEHEZEBB (kb. 28 perc): összetett szimuláció vagy algoritmus, több egymásra épülő számítási szakasz egy programban",
  ],
  medium: [
    "LEGKÖNNYEBB a sorban (kb. 5 perc): komplex, de rövid program egy-két lépéses számítással",
    "KICSIT KÖNNYEBB (kb. 8 perc): több lépés, feltételek és ciklusok kombinálva",
    "KÖZEPES SZINT (kb. 11 perc): többlépéses feldolgozás, egyszerűbb képletek, listák vagy szótárak",
    "KICSIT NEHEZEBB (kb. 14 perc): több részfeladat, adatszerkezetek összekapcsolása",
    "LEGNEHEZEBB (kb. 17 perc): összetettebb algoritmus vagy szimuláció, több szakasz egy programban",
  ],
  easy: [
    "LEGKÖNNYEBB a sorban (kb. 3 perc): rövid, egyszerű program, egy elágazással vagy ciklussal",
    "KICSIT KÖNNYEBB (kb. 5 perc): egyszerű feldolgozás, néhány számítási lépés",
    "KÖZEPES (kb. 7 perc): ciklus és feltétel együtt, egyszerű adatgyűjtés",
    "KICSIT NEHEZEBB (kb. 9 perc): több bemeneti adat feldolgozása és összesítése",
    "LEGNEHEZEBB (kb. 12 perc): több szakaszos program, egymásra épülő számítások egy futásban",
  ],
};

// Témakörök nehézség szerint — a feladatsorban minden kérdés más témakörből kerül ki.
const TOPICS: Record<Difficulty, string[]> = {
  easy: [
    "elágazások és egyszerű számítások",
    "ciklus és összegzés",
    "sztring-feldolgozás",
    "lista bejárása és szűrése",
    "egyszerű statisztika (átlag, maximum)",
  ],
  medium: [
    "többlépéses sztring-feldolgozás",
    "lista és szótár együttes használata",
    "dátum- és időszámítás",
    "egymásba ágyazott ciklusok, mintázatok",
    "rendezés és keresés",
    "egyszerű állapotgép",
  ],
  hard: [
    "numerikus módszerek (pl. gyökkeresés, numerikus integrálás)",
    "szimuláció adott lépésszámmal",
    "gráfok bejárása (szélességi keresés, távolságok)",
    "mátrixműveletek",
    "statisztika (szórás, medián, korreláció)",
    "geometria és koordináta-transzformáció",
    "bitműveletek és számrendszerek",
    "több lépéses algoritmus és állapotkezelés",
  ],
};

// Minden feladat más szövegkörnyezetben jelenjen meg.
const DOMAINS = [
  "egy szélerőmű-park termelési adatai",
  "egy szakorvosi rendelő betegfelvételi időpontjai",
  "egy mentőszolgálat riasztási naplója",
  "egy kisvasút menetrend-ütemezése",
  "egy repülőtér poggyászkezelő szalagjának terhelése",
  "egy szeizmológiai állomás rengésadatai",
  "egy halgazdaság tavainak vízminőségi mérései",
  "egy szőlőbirtok szüreti naplója",
  "egy kórházi gyógyszerraktár tételeinek lejárati ideje",
  "egy hangstúdió keverőjének jelszintjei",
  "egy múzeum termenkénti látogatószáma",
  "egy pékség kenyérsütési ciklusai",
  "egy űrszonda pályakorrekciós manőverei",
  "egy tengeri kikötő hajóbeérkezései",
  "egy bányaüzem talajmintáinak nehézfém-tartalma",
  "egy szerverfarm CPU-terhelési naplója",
  "egy lakóépület okosmérőinek napi adatai",
  "egy erdészet fakitermelési nyilvántartása",
  "egy madárvédelmi felmérés megfigyelései",
  "egy tűzoltóság riasztási körzeteinek adatai",
  "egy filmstúdió forgatási ütemterve",
  "egy vízmű nyomásmérő hálózatának adatai",
  "egy biológiai laboratórium sejtkultúrái",
  "egy esztergagép-park üzemidő-naplója",
  "egy gyógyszergyár tételgyártási adatai",
  "egy hajtómű-próbapad hőmérsékleti görbéi",
  "egy GPS-nyomkövető által rögzített útvonal",
  "egy jégkorong-bajnokság pontstatisztikája",
  "egy csillagvizsgáló fényességmérései",
  "egy hőlégballonos verseny ellenőrzőpontjai",
  "egy mélyűri antenna jelerőssége",
  "egy pályaudvari jegypénztár forgalma",
  "egy állatmenhely befogadási nyilvántartása",
  "egy okos öntözőrendszer talajnedvesség-érzékelői",
  "egy kohászati kemence hőprofilja",
  "egy elektromos autó töltőállomásainak foglaltsága",
  "egy hajógyár hegesztési varrat-minősítései",
  "egy metrószerelvény fékezési adatai",
  "egy szállodai szobafoglalási rendszer",
  "egy ökológiai kutatás madárszámlálásai",
  "egy olajfinomító desztillációs tornyának mérései",
  "egy kalibráló laboratórium mérési sorozata",
  "egy sakkverseny forduló-eredményei",
  "egy zenekar turnéjának koncertadatai",
  "egy kertvárosi csapadékmérő hálózat",
  "egy kvantumszimulátor állapotvektorai",
  "egy neurális hálózat tanítási veszteségei",
  "egy DNS-szekvenáló futás olvasatai",
  "egy közösségi közlekedési kártya tranzakciói",
  "egy pszichológiai kísérlet válaszidő-mérései",
  "egy sörfőzde erjesztőtartályainak hőmérséklete",
];

function pickRandom<T>(items: T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// XML-ben a CDATA-n belül a "]]>" nem szerepelhet, ezt szétbontjuk.
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlEscape(s: string): string {
  return xmlEscape(s).replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

interface Slot {
  index: number; // 1..5
  topic: string;
  domain: string;
  profile: string;
}

interface GeneratedQuestion {
  slot: number;
  title: string;
  topic: string;
  text: string;
  solution: string;
  testInputs: string[];
}

interface VerifiedTest {
  example: boolean;
  stdin: string;
  expected: string;
}

interface VerifiedQuestion {
  slot: number;
  title: string;
  topic: string;
  text: string;
  solution: string;
  tests: VerifiedTest[];
}

function buildQuestionXml(q: VerifiedQuestion, language: Language, index: number): string {
  const tests = q.tests
    .map(
      t => `      <testcase testtype="0" useasexample="${t.example ? 1 : 0}" hiderestiffail="0" mark="1.0000000" >
        <testcode>
          <text></text>
        </testcode>
        <stdin>
          <text>${cdata(t.stdin)}</text>
        </stdin>
        <expected>
          <text>${cdata(t.expected)}</text>
        </expected>
        <extra>
          <text></text>
        </extra>
        <display>
          <text>SHOW</text>
        </display>
      </testcase>`
    )
    .join("\n");

  return `<!-- question: ${index}  -->
  <question type="coderunner">
    <name>
      <text>${xmlEscape(q.title)}</text>
    </name>
    <questiontext format="html">
      <text>${cdata(q.text)}</text>
    </questiontext>
    <generalfeedback format="html">
      <text></text>
    </generalfeedback>
    <defaultgrade>1.0000000</defaultgrade>
    <penalty>0.0000000</penalty>
    <hidden>0</hidden>
    <idnumber></idnumber>
    <coderunnertype>${LANGUAGES[language].coderunner}</coderunnertype>
    <prototypetype>0</prototypetype>
    <allornothing>1</allornothing>
    <penaltyregime>0</penaltyregime>
    <precheck>0</precheck>
    <hidecheck>0</hidecheck>
    <showsource>0</showsource>
    <answerboxlines>18</answerboxlines>
    <answerboxcolumns>100</answerboxcolumns>
    <answerpreload></answerpreload>
    <globalextra></globalextra>
    <useace></useace>
    <resultcolumns></resultcolumns>
    <template></template>
    <iscombinatortemplate></iscombinatortemplate>
    <allowmultiplestdins></allowmultiplestdins>
    <answer>${cdata(q.solution)}</answer>
    <validateonsave>1</validateonsave>
    <testsplitterre></testsplitterre>
    <language></language>
    <acelang></acelang>
    <sandbox></sandbox>
    <grader></grader>
    <cputimelimitsecs></cputimelimitsecs>
    <memlimitmb></memlimitmb>
    <sandboxparams></sandboxparams>
    <templateparams></templateparams>
    <hoisttemplateparams>1</hoisttemplateparams>
    <extractcodefromjson>1</extractcodefromjson>
    <templateparamslang>None</templateparamslang>
    <templateparamsevalpertry>0</templateparamsevalpertry>
    <templateparamsevald>{}</templateparamsevald>
    <twigall>0</twigall>
    <uiplugin></uiplugin>
    <uiparameters></uiparameters>
    <attachments>0</attachments>
    <attachmentsrequired>0</attachmentsrequired>
    <maxfilesize>10240</maxfilesize>
    <filenamesregex></filenamesregex>
    <filenamesexplain></filenamesexplain>
    <displayfeedback>1</displayfeedback>
    <giveupallowed>0</giveupallowed>
    <prototypeextra></prototypeextra>
    <testcases>
${tests}
    </testcases>
  </question>`;
}

function buildQuizXml(questions: VerifiedQuestion[], language: Language, difficulty: Difficulty): string {
  const categoryName = `Programozási feladatok ${LANGUAGES[language].label} ${DIFFICULTY_LABELS[difficulty]}`;
  const category = `<!-- question: 0  -->
  <question type="category">
    <category>
      <text>${xmlEscape(`$module$/top/${categoryName}`)}</text>
    </category>
    <info format="moodle_auto_format">
      <text>${xmlEscape(categoryName)} kérdései</text>
    </info>
    <idnumber></idnumber>
  </question>`;

  const body = questions.map((q, i) => buildQuestionXml(q, language, i + 1)).join("\n\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
${category}

${body}

</quiz>
`;
}

function buildPrompt(language: Language, difficulty: Difficulty, slots: Slot[], instructions: string, context: string): string {
  const lang = LANGUAGES[language];
  const slotLines = slots
    .map(s => `  - slot ${s.index}: ${s.profile}; témakör = ${s.topic}; szövegkörnyezet = ${s.domain}`)
    .join("\n");

  const contextRule = context
    ? "2. SZÖVEGKÖRNYEZET: a feladatok a felhasználó által megadott kontextusban játszódjanak (lásd a sorokat). Ez felülírja a tiltott példák listáját. KOMPLEXITÁS: minden feladat legalább három egymásra épülő feldolgozási lépést igényeljen, és tartalmazzon valódi szakmai összefüggést, képletet vagy szabályt. Kerüld a triviális feladatokat."
    : "2. EREDETI SZÖVEGKÖRNYEZET ÉS KOMPLEXITÁS: a megadott szövegkörnyezetben játszódjon, és NE használd a következő túlhasznált példákat: kávézó, kertészet, sportverseny, társasjáték, könyvtár, webshop, iskolai osztály, raktár, parkoló, futóverseny. Minden feladat legalább három egymásra épülő feldolgozási lépést igényeljen (pl. beolvasás → szűrés vagy csoportosítás → számítás → formázott kiírás), és tartalmazzon valódi szakmai összefüggést, képletet vagy szabályt. Kerüld a triviális feladatokat (pl. egyetlen szorzás vagy összeadás).";
  return `Egyetemi szintű, automatikusan javított programozási feladatokat készítesz (Moodle CodeRunner).

NYELV: ${lang.prompt}
NEHÉZSÉGI SZINT: ${DIFFICULTY_LABELS[difficulty]}

A KÉRT FELADATOK (a nehézség a sorrendben a megadott profilt követi, ettől nem térhetsz el):
${slotLines}
${instructions.trim() ? `\nFELHASZNÁLÓI UTASÍTÁSOK (kötelezően vedd figyelembe, ha nem ütközik a szabályokkal):\n${instructions.trim()}\n` : ""}
SZABÁLYOK:
1. KOMPLEX PROGRAMOK: minden feladat egy teljes, önállóan futtatható program, ami a standard inputról olvas és a standard outputra ír. NE csak egy függvényt kérj. Használhatsz képleteket, numerikus számításokat, több lépéses logikát, adatszerkezeteket — a feladat legyen kreatív és egyetemi szintű.
${contextRule}
3. Minden feladat független: egyik megoldása se épüljön a másikra, és ne ugyanazt a problémát oldják meg más szövegezéssel sem.
4. A feladatszöveg magyar nyelvű, HTML formátumban (<p>, <ul>, <li>, <code>, <strong>, <em>, <sub>, <sup>). Pontosan írja le: mit kell számolni, a bemenet formátumát (sorok, értékek sorrendje), a kimenet formátumát és a számok kerekítését. NE írd ki a példa kimenetét — azt a rendszer a megoldás futtatásából generálja.
5. NUMERIKUS KIMENET: a lebegőpontos értékeket mindig fix tizedesjegy-számmal írd ki (Python: f'{x:.4f}', C++: std::fixed << std::setprecision(4)). Kerüld az olyan eseteket, ahol a kimenet nagyon érzékeny a kerekítésre.
6. ASCII KÖTELEZŐ: a megoldókód teljes egészében csak ASCII karaktert tartalmazhat — sem a stringekben, sem a promptokban (input('...')), sem a kiírt szövegekben, sem a kommentekben nincs ékezet. Pl. "Merések szama: " helyett "Meresek szama: ". A tesztkörnyezet ASCII kimenetet használ, az ékezetes karakter futásidejű hibát okoz.
7. A megoldás HELYES és lefut. Ne használj fájlokat, véletlenszámot, időt, hálózatot. Ne írj ki felesleges szöveget a bemenet kérése előtt kívül azon, amit a feladat előír (a promptokon kívül).
8. Adj pontosan ${TESTS_PER_QUESTION} bemeneti tesztesetet feladatonként ("testInputs"): az első legyen a feladat példája, a többi változatos, köztük szélső eset is. A bemenet soronként egy érték; a kimenetet NEM kell megadnod.

VÁLASZFORMÁTUM: csak egy JSON objektum, pontosan ebben a szerkezetben:
{"questions":[{"slot":1,"title":"rövid magyar cím","topic":"témakör","text":"HTML feladatszöveg","solution":"a teljes megoldókód","testInputs":["bemenet 1","bemenet 2","bemenet 3","bemenet 4"]}]}`;
}

async function generateQuestions(
  language: Language,
  difficulty: Difficulty,
  slots: Slot[],
  instructions: string,
  rejectionNote: string,
  context: string
): Promise<GeneratedQuestion[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Te egy egyetemi programozás-oktató asszisztens vagy. Hibátlan, lefutó megoldókódokat és pontos feladatszövegeket írsz. Minden válaszod érvényes JSON.",
      },
      {
        role: "user",
        content: buildPrompt(language, difficulty, slots, instructions, context) + rejectionNote,
      },
    ],
    temperature: 0.4,
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}") as { questions?: GeneratedQuestion[] };
  return parsed.questions ?? [];
}

// A megoldókódot lefuttatjuk minden bemenetre; a kimenet lesz a tesztelvárt eredmény.
// Ha bármelyik futás hibát ad vagy üres a kimenet, a feladat nem fogadható el.
const NON_ASCII = /[^\x00-\x7F]/;

async function verifyQuestion(q: GeneratedQuestion, language: Language): Promise<VerifiedQuestion | null> {
  if (!q.title || !q.text || !q.solution || !Array.isArray(q.testInputs)) return null;

  const inputs = q.testInputs
    .filter(s => typeof s === "string")
    .slice(0, TESTS_PER_QUESTION)
    .map(s => (s === "" || s.endsWith("\n") ? s : `${s}\n`));
  if (inputs.length < 2) return null;

  const runs = await Promise.all(inputs.map(stdin => runProgram(language, q.solution, stdin)));
  if (runs.some(r => !r.ok) || runs.some(r => r.stdout.trim() === "")) return null;

  // A Moodle/CodeRunner környezet ASCII kimenetet használ: ékezetes forrás vagy kimenet futásidejű hibát okoz.
  if (NON_ASCII.test(q.solution) || runs.some(r => NON_ASCII.test(r.stdout))) return null;

  const tests: VerifiedTest[] = inputs.map((stdin, i) => ({
    example: i === 0,
    stdin,
    expected: runs[i].stdout,
  }));

  // A példa a feladatszövegbe is kikerül, a futás tényleges kimenetével.
  const exampleBlock = `<p><strong>Példa bemenet:</strong></p><pre>${htmlEscape(tests[0].stdin)}</pre><p><strong>Példa kimenet:</strong></p><pre>${htmlEscape(tests[0].expected)}</pre>`;

  return {
    slot: q.slot,
    title: q.title,
    topic: q.topic,
    text: `${q.text}\n${exampleBlock}`,
    solution: q.solution,
    tests,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const language = body.language as Language;
    const difficulty = body.difficulty as Difficulty;
    const instructions = typeof body.instructions === "string" ? body.instructions : "";
    const context = typeof body.context === "string" ? body.context.trim().slice(0, 300) : "";

    if (!LANGUAGES[language]) {
      return NextResponse.json({ error: "Ismeretlen programozási nyelv" }, { status: 400 });
    }
    if (!DIFFICULTY_LABELS[difficulty]) {
      return NextResponse.json({ error: "Ismeretlen nehézségi szint" }, { status: 400 });
    }

    const topics = pickRandom(TOPICS[difficulty], QUESTION_COUNT);
    const domains = context
      ? Array.from({ length: QUESTION_COUNT }, () => context)
      : pickRandom(DOMAINS, QUESTION_COUNT);
    const slots: Slot[] = Array.from({ length: QUESTION_COUNT }, (_, i) => ({
      index: i + 1,
      topic: topics[i % topics.length],
      domain: domains[i],
      profile: SLOT_PROFILES[difficulty][i],
    }));

    const verified: (VerifiedQuestion | undefined)[] = Array(QUESTION_COUNT).fill(undefined);
    let rejectionNote = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const missing = slots.filter((_, i) => !verified[i]);
      if (!missing.length) break;

      const generated = await generateQuestions(language, difficulty, missing, instructions, rejectionNote, context);
      const wanted = new Set(missing.map(s => s.index));
      const candidates = generated.filter(q => wanted.has(q.slot));

      const results = await Promise.all(candidates.map(q => verifyQuestion(q, language)));
      results.forEach(r => {
        if (r) verified[r.slot - 1] = r;
      });

      const stillMissing = slots.filter((_, i) => !verified[i]).map(s => s.index);
      rejectionNote = stillMissing.length
        ? `\n\nFIGYELEM: az előző próbálkozásban ezek a slotok nem feleltek meg (futási hiba, üres kimenet, vagy ékezetes karakter a kódban/kimenetben): ${stillMissing.join(", ")}. Írd újra őket. A megoldókód legyen teljesen ASCII, hibátlan és lefutó.`
        : "";
    }

    const questions = verified.filter((q): q is VerifiedQuestion => !!q);
    if (questions.length < QUESTION_COUNT) {
      return NextResponse.json(
        { error: `Nem sikerült mind a ${QUESTION_COUNT} feladatot hibátlanul generálni (${questions.length} kész). Próbáld újra.` },
        { status: 500 }
      );
    }

    const xml = buildQuizXml(questions, language, difficulty);
    const fileName = `programozasi_feladatok_${language}_${difficulty}`;

    return NextResponse.json({
      xml,
      fileName,
      questions: questions.map(q => ({
        title: q.title,
        topic: q.topic,
        plainText: stripHtml(q.text),
        solution: q.solution,
        testCount: q.tests.length,
      })),
    });
  } catch (error: any) {
    console.error("Programozási feladat generálási hiba:", error);
    return NextResponse.json(
      { error: error.message || "Hiba a programozási feladat generálása során" },
      { status: 500 }
    );
  }
}
