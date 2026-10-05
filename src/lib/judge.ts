// Külső kódfuttató (Judge0 CE kompatibilis API) — a generált megoldókódokat ezen futtatjuk,
// hogy a tesztesetek kimenete a ténylegesen lefutó program kimenete legyen.
//
// Környezeti változók (opcionális):
//   JUDGE0_URL      — API alap URL (alapértelmezés: https://ce.judge0.com)
//   JUDGE0_API_KEY  — ha a használt példány kulcsot kér (X-Auth-Token fejléc)

export type RunLanguage = "python" | "cpp";

// Judge0 CE nyelvazonosítók: 71 = Python 3, 54 = C++ (GCC)
const LANGUAGE_IDS: Record<RunLanguage, number> = {
  python: 71,
  cpp: 54,
};

const STATUS_ACCEPTED = 3;

export interface RunResult {
  ok: boolean;
  stdout: string;
  error?: string;
}

const JUDGE_URL = (process.env.JUDGE0_URL ?? "https://ce.judge0.com").replace(/\/$/, "");

function b64encode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function b64decode(s: string | null | undefined): string {
  return s ? Buffer.from(s, "base64").toString("utf8") : "";
}

export async function runProgram(language: RunLanguage, source: string, stdin: string): Promise<RunResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.JUDGE0_API_KEY) headers["X-Auth-Token"] = process.env.JUDGE0_API_KEY;

  const res = await fetch(`${JUDGE_URL}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: LANGUAGE_IDS[language],
      source_code: b64encode(source),
      stdin: b64encode(stdin),
    }),
  });

  if (!res.ok) {
    return { ok: false, stdout: "", error: `Kódfuttató HTTP ${res.status}` };
  }

  const data = await res.json();
  const statusId: number | undefined = data?.status?.id;
  if (statusId !== STATUS_ACCEPTED) {
    const detail = b64decode(data?.compile_output) || b64decode(data?.stderr) || data?.status?.description || "ismeretlen hiba";
    return { ok: false, stdout: "", error: detail.trim() };
  }

  return { ok: true, stdout: b64decode(data.stdout) };
}
