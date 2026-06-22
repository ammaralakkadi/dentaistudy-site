import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FREE_DAILY_LIMIT = 12;
const PRO_DAILY_LIMIT = 100;

// Safety nets
const HISTORY_WINDOW = 14;
const MAX_MESSAGE_CHARS = 6000;
const MAX_OUTPUT_TOKENS_QA = 3500;
const MAX_OUTPUT_TOKENS_DEEP = 7000;

// Model routing
const GEMINI_EXAM_COACH_MODEL = "gemini-2.5-flash-lite";
const GEMINI_STUDY_MODEL = "gemini-2.5-flash";

// Notes strategy
const NOTES_SINGLE_PASS_CHAR_LIMIT = 150_000;
const NOTES_HARD_SAFETY_CAP = 220_000;
const LARGE_NOTES_MAX_CONTEXT_CHARS = 150_000;
const LARGE_NOTES_OUTPUT_TOKENS = 10_000;
const LARGE_NOTES_PAGE_THRESHOLD = 150;
const MAX_NOTES_PDF_PAGES = 900;
const CHARS_PER_PAGE_ESTIMATE = 2000;

const CHUNK_CHARS = 2500;
const CHUNK_OVERLAP = 150;

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function truncateText(text: string, maxChars: number): string {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function cleanExamCoachLeakage(text: string): string {
  const original = String(text || "");
  const lines = original.trim().split(/\r?\n/);

  const leakedPlannerLine = (line: string) =>
    /^STEP\s+[123]\s*:/i.test(line) ||
    /^This is a TYPE\s+[A-D]\s+question\b/i.test(line) ||
    /^The user is asking\b/i.test(line) ||
    /^Apply the correct answer architecture/i.test(line) ||
    /^Apply formatting and length rules/i.test(line);

  while (lines.length) {
    const first = lines[0].trim();

    if (!first || leakedPlannerLine(first)) {
      lines.shift();
      continue;
    }

    break;
  }

  return lines.join("\n").trim() || original.trim();
}

function cleanNotesMarkdown(text: string): string {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      let raw = line.trimEnd();
      const trimmed = raw.trim();

      const adultDoseNote = /^\\?\*\s*(Maximum adult dose.+)$/i.exec(trimmed);
      if (adultDoseNote) {
        return `- ${adultDoseNote[1].trim()}`;
      }

      const cephalosporinNote = /^\\?#\s*(Cephalosporins.+)$/i.exec(trimmed);
      if (cephalosporinNote) {
        return `- ${cephalosporinNote[1].trim()}`;
      }

      const deepHeading = /^(#{4,6})\s+(.+)$/.exec(raw);
      if (deepHeading) {
        return `### ${deepHeading[2].trim()}`;
      }

      raw = raw
        .replace(/\\\*#/g, "")
        .replace(/\\\*/g, "")
        .replace(/\\#/g, "")
        .replace(/\*#/g, "")
        .replace(/\b(Adults|Children)\*(\s*\|?\s*)$/i, "$1$2")
        .replace(/([A-Za-z)])#(\s|\||$)/g, "$1$2");

      return raw.replace(/^(\s*)\*\s+/, "$1- ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isGeminiRateOrTransient(status: number | null | undefined): boolean {
  if (!status) return false;
  // retry on rate-limit / transient overload
  return status === 429 || status === 503 || (status >= 500 && status <= 599);
}

async function fetchGeminiWithBackoff(
  url: string,
  body: unknown,
  apiKey: string,
): Promise<Response> {
  let res: Response | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status !== 429 && res.status < 500) return res;

    const delayMs = Math.min(8000, 500 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return res!;
}

type GeminiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function generateGeminiText(options: {
  model: string;
  messages: GeminiMessage[];
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  enableThinking?: boolean;
}): Promise<string> {
  const systemText = options.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n\n");

  const contents = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || " " }],
    }));

  const requestBody: any = {
    contents: contents.length
      ? contents
      : [{ role: "user", parts: [{ text: "Continue." }] }],
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    },
  };

  if (options.enableThinking) {
    requestBody.generationConfig.thinkingConfig = { thinkingBudget: 8000 };
  }

  if (systemText) {
    requestBody.systemInstruction = { parts: [{ text: systemText }] };
  }

  if (options.responseMimeType) {
    requestBody.generationConfig.responseMimeType = options.responseMimeType;
  }

  if (options.responseSchema) {
    requestBody.generationConfig.responseSchema = options.responseSchema;
  }

  const res = await fetchGeminiWithBackoff(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
    requestBody,
    GEMINI_API_KEY,
  );

  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : null;

  if (!res.ok) {
    throw Object.assign(
      new Error(`GEMINI_ERROR ${res.status}: ${raw.slice(0, 500)}`),
      {
        status: res.status,
        raw: raw.slice(0, 500),
      },
    );
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => String(part?.text ?? ""))
    .join("")
    .trim();
}

async function generateGeminiTextWithFallback(options: {
  model: string;
  fallbackModel?: string;
  messages: GeminiMessage[];
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  enableThinking?: boolean;
}): Promise<string> {
  try {
    return await generateGeminiText({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      responseMimeType: options.responseMimeType,
      responseSchema: options.responseSchema,
      enableThinking: options.enableThinking,
    });
  } catch (e: any) {
    const status = Number(e?.status ?? null);
    if (
      options.fallbackModel &&
      isGeminiRateOrTransient(Number.isFinite(status) ? status : null)
    ) {
      return await generateGeminiText({
        model: options.fallbackModel,
        messages: options.messages,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: options.responseMimeType,
        responseSchema: options.responseSchema,
      });
    }
    throw e;
  }
}

// Parses text that contains page markers like: [Page 3].
function parsePageMarkers(
  text: string,
): Array<{ page: number | null; text: string }> {
  const t = String(text || "").trim();

  if (!/\[Page\s+\d+\]/.test(t)) {
    return [{ page: null, text: t }];
  }

  const out: Array<{ page: number | null; text: string }> = [];
  const re = /\[Page\s+(\d+)\]/g;

  let lastIndex = 0;
  let lastPage: number | null = null;

  for (;;) {
    const m = re.exec(t);
    if (!m) break;

    const idx = m.index;
    if (idx > lastIndex) {
      const chunk = t.slice(lastIndex, idx).trim();
      if (chunk) out.push({ page: lastPage, text: chunk });
    }

    lastPage = Number(m[1]);
    lastIndex = re.lastIndex;
  }

  const tail = t.slice(lastIndex).trim();
  if (tail) out.push({ page: lastPage, text: tail });

  return out;
}

function splitIntoPages(
  text: string,
): Array<{ page: number | null; text: string }> {
  return parsePageMarkers(String(text || "").slice(0, NOTES_HARD_SAFETY_CAP));
}

function chunkText(pageText: string): string[] {
  const s = (pageText || "").replace(/\s+/g, " ").trim();
  if (!s) return [];

  const chunks: string[] = [];
  let i = 0;

  while (i < s.length) {
    const end = Math.min(s.length, i + CHUNK_CHARS);
    const slice = s.slice(i, end).trim();
    if (slice) chunks.push(slice);

    if (end >= s.length) break;
    i = Math.max(0, end - CHUNK_OVERLAP);
  }

  return chunks;
}

type PdfDoc = {
  file_id: string;
  file_name?: string;
  text: string;
  pages?: number | null;
};

function makeBatchesByCharLimit(rows: any[], maxChars: number) {
  const batches: any[][] = [];
  let cur: any[] = [];
  let curLen = 0;

  for (const r of rows) {
    const txt = String(r.content || "").trim();
    if (!txt) continue;

    const addLen = txt.length + 40; // tiny buffer for headers/newlines
    if (cur.length && curLen + addLen > maxChars) {
      batches.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(r);
    curLen += addLen;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

function formatBatch(rows: any[]) {
  let out = "";
  for (const r of rows) {
    const page =
      r.page_start == null
        ? ""
        : ` (page ${r.page_start}${r.page_end && r.page_end !== r.page_start ? `-${r.page_end}` : ""})`;
    out += `\n--- ${r.file_name || "PDF"}${page} ---\n${String(r.content || "").trim()}\n`;
  }
  return out.trim();
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseJsonObject(text: string): any {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}

function salvageArrayItems(rawText: string, keys: string[]): any[] {
  const text = String(rawText || "");
  let start = -1;

  for (const key of keys) {
    const match = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
    if (match) {
      start = match.index + match[0].length;
      break;
    }
  }

  if (start < 0) return [];

  const items: any[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let itemStart = -1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) itemStart = i;
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0 && itemStart >= 0) {
        try {
          items.push(JSON.parse(text.slice(itemStart, i + 1)));
        } catch (_) {
          // Skip malformed partial item and keep completed items.
        }
        itemStart = -1;
      }
      continue;
    }

    if (ch === "]" && depth === 0) break;
  }

  return items;
}

function pickFlashcardItems(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.cards)) return parsed.cards;
  if (Array.isArray(parsed?.flashcards)) return parsed.flashcards;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

function normalizeFlashcards(
  value: any,
): Array<{ front: string; back: string }> {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((card: any) => ({
      front: String(
        card?.front ??
          card?.question ??
          card?.prompt ??
          card?.term ??
          card?.card_front ??
          "",
      ).trim(),
      back: String(
        card?.back ??
          card?.answer ??
          card?.explanation ??
          card?.definition ??
          card?.card_back ??
          "",
      ).trim(),
    }))
    .filter((card) => card.front && card.back)
    .slice(0, 30);
}

function pickQuizItems(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.questions)) return parsed.questions;
  if (Array.isArray(parsed?.quiz)) return parsed.quiz;
  if (Array.isArray(parsed?.mcqs)) return parsed.mcqs;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

function normalizeQuizOptions(item: any): string[] {
  if (Array.isArray(item?.options)) {
    return item.options
      .map((option: unknown) => String(option ?? "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  return [item?.a, item?.b, item?.c, item?.d, item?.e]
    .map((option) => String(option ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function resolveCorrectIndex(item: any, options: string[]): number {
  const rawIndex = Number(item?.correct_index ?? item?.answer_index);
  if (
    Number.isInteger(rawIndex) &&
    rawIndex >= 0 &&
    rawIndex < options.length
  ) {
    return rawIndex;
  }

  const answer = String(
    item?.correct_answer ?? item?.answer ?? item?.correct ?? "",
  ).trim();

  if (/^[A-E]$/i.test(answer)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) return index;
  }

  const match = options.findIndex(
    (option) => option.toLowerCase() === answer.toLowerCase(),
  );

  return match >= 0 ? match : 0;
}

function normalizeQuizQuestions(value: any) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((item: any) => {
      const options = normalizeQuizOptions(item);
      const correctIndex = resolveCorrectIndex(item, options);

      return {
        question: String(
          item?.question ?? item?.stem ?? item?.prompt ?? "",
        ).trim(),
        options,
        correct_index: correctIndex,
        explanation: String(
          item?.explanation ?? item?.rationale ?? item?.reason ?? "",
        ).trim(),
      };
    })
    .filter(
      (item) =>
        item.question &&
        item.options.length >= 3 &&
        item.correct_index >= 0 &&
        item.correct_index < item.options.length,
    )
    .slice(0, 30);
}

const FLASHCARD_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
        },
        required: ["front", "back"],
      },
    },
  },
  required: ["title", "cards"],
};

const QUIZ_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
          },
          correct_index: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correct_index", "explanation"],
      },
    },
  },
  required: ["title", "questions"],
};

const QUIZ_DIFFICULTY_SPEC: Record<string, string> = {
  easy:
    "EASY — direct recall and single-step clinical reasoning. Short, clear stems. " +
    "One clearly correct answer; distractors are wrong in an obvious way to a student who has studied the material. Good for first-pass revision.",
  normal:
    "NORMAL — licensing-exam style. Clinical scenario stems with 1-2 decision points. " +
    "Distractors are plausible and reflect common partial-understanding errors. Tests applied understanding, not memorization.",
  hard:
    "HARD — multi-step clinical reasoning. Stems include contraindications, exceptions, sequencing, or conflicting clinical findings that must be weighed against each other. " +
    "Distractors are close calls that mirror real examiner traps, not just wrong facts.",
};

function countBuffer(count: number): number {
  if (count <= 10) return 2;
  if (count <= 25) return 3;
  return 4;
}

async function refundAiCredit(
  adminClient: any,
  snapshot: { userId: string; metadata: Record<string, unknown> } | null,
): Promise<void> {
  if (!snapshot) return;

  try {
    await adminClient.auth.admin.updateUserById(snapshot.userId, {
      user_metadata: snapshot.metadata,
    });
  } catch (_) {
    // Best-effort refund. Do not block the error response.
  }
}

async function topUpFlashcards(params: {
  sourceText: string;
  existingFronts: string[];
  needed: number;
}): Promise<Array<{ front: string; back: string }>> {
  const avoidList = params.existingFronts
    .slice(0, 30)
    .map((front) => `- ${front}`)
    .join("\n");

  const aiText = await generateGeminiTextWithFallback({
    model: GEMINI_STUDY_MODEL,
    fallbackModel: GEMINI_EXAM_COACH_MODEL,
    temperature: 0.4,
    maxOutputTokens: Math.min(6000, Math.max(1800, params.needed * 260 + 500)),
    responseMimeType: "application/json",
    responseSchema: FLASHCARD_RESPONSE_SCHEMA,
    messages: [
      {
        role: "system",
        content:
          "You are the DentAIstudy exam tutor. Generate additional active-recall flashcards that do not duplicate the ones already produced. " +
          "Back: 2-3 concise sentences, max 50 words. Output valid JSON only. No preamble. No markdown.",
      },
      {
        role: "user",
        content:
          `Create exactly ${params.needed} NEW active-recall flashcards from the source below. ` +
          `Do not repeat or rephrase these existing fronts:\n${avoidList || "(none)"}\n\n` +
          'Return this schema: {"title":"short deck title","cards":[{"front":"question","back":"answer"}]}\n\n' +
          `Source:\n${params.sourceText}`,
      },
    ],
  });

  const parsed = parseJsonObject(aiText);
  let topUp = normalizeFlashcards(pickFlashcardItems(parsed));

  if (!topUp.length) {
    topUp = normalizeFlashcards(
      salvageArrayItems(aiText, ["cards", "flashcards", "items"]),
    );
  }

  return topUp;
}

async function topUpQuizQuestions(params: {
  sourceText: string;
  existingQuestions: string[];
  needed: number;
  difficulty: string;
}): Promise<ReturnType<typeof normalizeQuizQuestions>> {
  const avoidList = params.existingQuestions
    .slice(0, 30)
    .map((question) => `- ${question}`)
    .join("\n");

  const aiText = await generateGeminiTextWithFallback({
    model: GEMINI_STUDY_MODEL,
    fallbackModel: GEMINI_EXAM_COACH_MODEL,
    temperature: params.difficulty === "hard" ? 0.35 : 0.25,
    maxOutputTokens: Math.min(6000, Math.max(2000, params.needed * 380 + 500)),
    responseMimeType: "application/json",
    responseSchema: QUIZ_RESPONSE_SCHEMA,
    messages: [
      {
        role: "system",
        content:
          "You are the DentAIstudy exam writer. Generate additional MCQs that do not duplicate the ones already produced. " +
          "Explanations: 1-2 concise sentences, max 45 words. Output valid JSON only. No preamble. No markdown.",
      },
      {
        role: "user",
        content:
          `Create exactly ${params.needed} NEW ${params.difficulty} multiple-choice questions from the source below. ` +
          `Do not repeat or rephrase these existing stems:\n${avoidList || "(none)"}\n\n` +
          'Return this schema: {"title":"short quiz title","questions":[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]}\n\n' +
          `Source:\n${params.sourceText}`,
      },
    ],
  });

  const parsed = parseJsonObject(aiText);
  let topUp = normalizeQuizQuestions(pickQuizItems(parsed));

  if (!topUp.length) {
    topUp = normalizeQuizQuestions(
      salvageArrayItems(aiText, ["questions", "quiz", "mcqs", "items"]),
    );
  }

  return topUp;
}

function estimatePageCount(
  charCount: number,
  providedPages?: number | null,
): number {
  if (providedPages && providedPages > 0) return providedPages;
  return Math.max(1, Math.round(charCount / CHARS_PER_PAGE_ESTIMATE));
}

function shouldSkipLargePdfPage(text: string): boolean {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return true;
  if (/\bcontents\b/.test(t)) return false;
  return /isbn|copyright|all rights reserved|published by|publisher|printed in|library of congress|british library|contributors|acknowledgements|preface/.test(
    t,
  );
}

function looksLikeChapterOpener(text: string): boolean {
  const clean = String(text || "")
    .replace(/\r/g, "")
    .trim();
  const firstLine = clean.split("\n").find(Boolean) || "";
  if (/^\d+\s+chapter\s+\d+/i.test(firstLine)) return false;

  const firstBlock = clean.slice(0, 1200);
  return (
    /^\s*(chapter|unit|section)\s+\d{1,2}\b/im.test(firstBlock) ||
    /^\s*\d{1,2}\s*\n[A-Z][^\n]{3,100}\n/.test(firstBlock)
  );
}

function rowFromPage(
  page: { page: number | null; text: string },
  fileName: string,
  chunkIndex: number,
) {
  return {
    chunk_index: chunkIndex,
    page_start: page.page,
    page_end: page.page,
    content: String(page.text || "").trim(),
    file_name: fileName,
  };
}

function buildRowsFromPages(
  pages: Array<{ page: number | null; text: string }>,
  fileName: string,
) {
  const rows: any[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const parts = chunkText(page.text);

    for (const part of parts) {
      rows.push({
        chunk_index: chunkIndex++,
        page_start: page.page,
        page_end: page.page,
        content: part,
        file_name: fileName,
      });
    }
  }

  return rows;
}

function buildLargePdfStudyRows(rawText: string, fileName: string) {
  const pages = parsePageMarkers(rawText);
  const selected = new Map<number, { page: number | null; text: string }>();

  const addPage = (index: number) => {
    const page = pages[index];
    if (!page || shouldSkipLargePdfPage(page.text)) return;
    selected.set(index, page);
  };

  pages.forEach((page, index) => {
    const text = String(page.text || "");
    const lower = text.toLowerCase();

    if (/\bcontents\b/.test(lower)) addPage(index);

    if (looksLikeChapterOpener(text)) {
      addPage(index);
      addPage(index + 1);
      addPage(index + 2);
    }
  });

  if (!selected.size) {
    pages.forEach((_, index) => {
      if (index < 12 || index % 20 === 0) addPage(index);
    });
  }

  const rows: any[] = [];
  let usedChars = 0;
  let chunkIndex = 0;

  Array.from(selected.keys())
    .sort((a, b) => a - b)
    .forEach((index) => {
      if (usedChars >= LARGE_NOTES_MAX_CONTEXT_CHARS) return;

      const page = selected.get(index)!;
      const clean = String(page.text || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!clean) return;

      const remaining = LARGE_NOTES_MAX_CONTEXT_CHARS - usedChars;
      const content = clean.slice(0, Math.max(0, remaining));
      if (!content) return;

      rows.push(
        rowFromPage({ ...page, text: content }, fileName, chunkIndex++),
      );
      usedChars += content.length;
    });

  return rows;
}

function hasMcqIntent(text: string): boolean {
  const t = String(text || "").toLowerCase();
  return /\b(mcqs?|multiple[\s-]choice|quiz me|test me)\b/.test(t);
}

const MCQ_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

function detectRequestedMcqCount(text: string): number | null {
  const t = String(text || "").toLowerCase();

  const digitMatch = t.match(/\b(\d{1,2})\s*(?:mcqs?|questions?|qs)\b/);
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    if (n >= 1 && n <= 40) return n;
  }

  const wordMatch = t.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:mcqs?|questions?|qs)\b/,
  );
  if (wordMatch) {
    const n = MCQ_NUMBER_WORDS[wordMatch[1]];
    if (n) return n;
  }

  return null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "SERVER_MISCONFIGURED" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const topic = String(body?.topic ?? "").trim();
    const mode = String(body?.mode ?? "General overview");
    const subject = String(body?.subject ?? "General dentistry");
    const conversationId = String(body?.conversation_id ?? "").trim();

    // NEW: controls behavior without changing UI much
    const task = String(body?.task ?? "qa").trim(); // "qa" | "chapter_notes" | "flashcards" | "quiz"
    const activeFileId =
      String(body?.file_id ?? "").trim() ||
      String(body?.pdf_docs?.[0]?.file_id ?? "").trim();

    const pdfDocs: PdfDoc[] = Array.isArray(body?.pdf_docs)
      ? body.pdf_docs.map((d: any) => ({
          file_id: String(d?.file_id ?? ""),
          file_name: String(d?.file_name ?? ""),
          text: String(d?.text ?? ""),
          pages: d?.pages ?? null,
        }))
      : [];

    const messagesFromClient = Array.isArray(body?.messages)
      ? body.messages
          .filter(
            (m: any) => m && (m.role === "user" || m.role === "assistant"),
          )
          .slice(-HISTORY_WINDOW)
          .map((m: any) => ({
            role: m.role,
            content: truncateText(String(m.content ?? ""), MAX_MESSAGE_CHARS),
          }))
      : null;

    if (!topic && !messagesFromClient?.length) {
      return new Response(JSON.stringify({ error: "TOPIC_REQUIRED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client (service role): limits + writes
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
      },
    );

    const authHeader = req.headers.get("Authorization") || "";

    // Identify user
    let userId: string | null = null;
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const jwt = authHeader.slice(7).trim();
      const { data } = await supabaseAdmin.auth.getUser(jwt);
      if (data?.user) userId = data.user.id;
    }

    let subscriptionTier = "free";
    let isProUser = false;

    // Plan lookup + daily AI credit limit
    let quotaUserMeta: any = null;

    if (userId) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (data?.user) {
        quotaUserMeta = data.user.user_metadata ?? {};

        const appMeta: any = data.user.app_metadata ?? {};
        const tier = appMeta.subscription_tier || "free";
        const isPro = tier === "pro" || tier === "pro_yearly";

        subscriptionTier = tier;
        isProUser = isPro;
      }
    }

    if (
      (task === "flashcards" ||
        task === "quiz" ||
        (task === "chapter_notes" && pdfDocs.length > 0)) &&
      !isProUser
    ) {
      return new Response(
        JSON.stringify({ error: "PRO_REQUIRED", tier: subscriptionTier }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const maxPdfDocs = isProUser && task === "chapter_notes" ? 1 : 0;

    if (pdfDocs.length > maxPdfDocs) {
      return new Response(
        JSON.stringify({
          error: "PDF_LIMIT_REACHED",
          tier: subscriptionTier,
          maxPdfs: maxPdfDocs,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let creditRefundSnapshot: {
      userId: string;
      metadata: Record<string, unknown>;
    } | null = null;

    if (userId && quotaUserMeta) {
      const today = getTodayUTC();
      const limit = isProUser ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
      const requestCost =
        task === "flashcards" ||
        task === "quiz" ||
        task === "chapter_notes" ||
        Boolean(activeFileId) ||
        pdfDocs.length > 0
          ? 2
          : 1;

      let used =
        typeof quotaUserMeta.ai_count === "number" ? quotaUserMeta.ai_count : 0;
      let date =
        typeof quotaUserMeta.ai_date === "string"
          ? quotaUserMeta.ai_date
          : null;

      if (date !== today) {
        used = 0;
        date = today;
      }

      if (used + requestCost > limit) {
        return new Response(
          JSON.stringify({
            error: "LIMIT_REACHED",
            tier: subscriptionTier,
            limit,
            used,
            requestCost,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      creditRefundSnapshot = {
        userId,
        metadata: {
          ...quotaUserMeta,
          ai_date: today,
          ai_count: used,
        },
      };

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...quotaUserMeta,
          ai_date: today,
          ai_count: used + requestCost,
        },
      });
    }

    if (
      task === "chapter_notes" &&
      pdfDocs.length &&
      String(pdfDocs[0]?.text || "").trim()
    ) {
      const doc = pdfDocs[0];
      const fileName = String(doc.file_name || "Dental PDF").trim();
      const rawText = String(doc.text || "").trim();
      const estimatedPages = estimatePageCount(rawText.length, doc.pages);

      if (estimatedPages > MAX_NOTES_PDF_PAGES) {
        return new Response(
          JSON.stringify({
            error: "PDF_TOO_LARGE",
            message: `This PDF has about ${estimatedPages} pages. Upload a book under ${MAX_NOTES_PDF_PAGES} pages or split it by section.`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const isLargePdf =
        rawText.length > NOTES_SINGLE_PASS_CHAR_LIMIT ||
        estimatedPages > LARGE_NOTES_PAGE_THRESHOLD;

      const rows = isLargePdf
        ? buildLargePdfStudyRows(rawText, fileName)
        : buildRowsFromPages(splitIntoPages(rawText), fileName);

      if (!rows.length) {
        return new Response(JSON.stringify({ error: "NO_PDF_TEXT_FOUND" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isLargePdf) {
        let studyMap = await generateGeminiTextWithFallback({
          model: GEMINI_STUDY_MODEL,
          fallbackModel: GEMINI_EXAM_COACH_MODEL,
          enableThinking: true,
          temperature: 0.3,
          maxOutputTokens: LARGE_NOTES_OUTPUT_TOKENS,
          messages: [
            {
              role: "system",
              content:
                "You are the DentAIstudy Notes engine — a senior dental educator, licensing exam coach, and medical education content editor. A very large dental PDF was uploaded. Your job is not to rewrite the whole book. Create one clean, readable, exam-ready chapter map from the provided extracted structure and chapter samples. Cover all visible chapters, including final chapters, even if earlier chapters must be tighter. Ignore copyright, ISBN, publisher, preface, acknowledgements, contributors, and dosage/legal disclaimers unless the actual study content requires a safety warning. Use the PDF as the scope and organize it for exam revision. Write like a professional study-note editor: clean markdown headings, correct punctuation, precise bullets, and no raw formatting marks. Use only #, ##, and ### headings. Never use ####, #####, or deeper heading levels. No greeting. No filler. Do not mention internal chunking or extraction limits.",
            },
            {
              role: "user",
              content:
                `Source: ${fileName}\n` +
                `Detected size: about ${estimatedPages} pages.\n` +
                "Deliverable: Create one exam-ready note sheet for the full uploaded book.\n\n" +
                "Required structure:\n" +
                "# [Book or file title] — Exam Notes\n" +
                "## How to study this book\n" +
                "- Give 4-6 bullets that tell an anxious exam candidate how to use the material.\n" +
                "## Chapter-by-chapter high-yield map\n" +
                "Use this exact chapter format for every visible chapter or major section:\n" +
                "### 1. [Chapter title]\n" +
                "- **Core exam focus:** The main exam theme of this chapter.\n" +
                "- **Must-know clinical points:** The practical points a candidate must remember.\n" +
                "- **Common viva/MCQ traps:** The mistakes candidates commonly make.\n" +
                "- **What to revise first:** The first material to review before the exam.\n" +
                "Continue numbering as 2., 3., 4., and so on. Never write headings like `1 History and examination`; always write `1. History and examination`.\n" +
                "## Final high-yield traps\n" +
                "- List the cross-chapter mistakes students commonly make.\n\n" +
                "Markdown rules:\n" +
                "- Use clean markdown only: #, ##, ###, bullets, numbered headings, bold labels, and tables only when useful.\n" +
                "- Never use ####, #####, or deeper heading levels.\n" +
                "- Use **bold** for labels such as **Core exam focus:**.\n" +
                "- Use *italic* only for true emphasis. Never leave raw asterisks visible in the final answer.\n" +
                "- Do not waste space on publisher details, ISBN, editors, contents admin, disclaimers, preface, or acknowledgements.\n" +
                "- Do not pretend this is a full page-by-page rewrite. Make it a smart study map.\n" +
                "- If a chapter has only a title or limited extracted detail, still include a concise exam-revision direction, but do not invent page-specific facts.\n" +
                "- Use practical dental exam language, not textbook marketing language.\n\n" +
                `Extracted structure and chapter samples:\n${formatBatch(rows)}`,
            },
          ],
        });

        studyMap = cleanNotesMarkdown(studyMap);

        return new Response(JSON.stringify({ output: studyMap }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const batches = makeBatchesByCharLimit(rows, 12000);
      const partials: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batchText = formatBatch(batches[i]);

        const sectionText = await generateGeminiTextWithFallback({
          model: GEMINI_STUDY_MODEL,
          fallbackModel: GEMINI_EXAM_COACH_MODEL,
          enableThinking: true,
          temperature: 0.25,
          maxOutputTokens: MAX_OUTPUT_TOKENS_QA,
          messages: [
            {
              role: "system",
              content:
                "You are the DentAIstudy Notes engine — a senior dental educator, licensing exam coach, and medical education content editor. Create exam-ready notes from the provided PDF text. Use direct headings, high-yield bullets, mechanisms, clinical relevance, and exam traps where supported. Use clean markdown only: ## and ### headings, `1. Heading` not `1 Heading`, `- **Label:** text` for bullets, and valid tables when useful. Never use ####, #####, or deeper heading levels. Use **bold** for labels and *italic* only for true emphasis. Never leave raw asterisks visible in the final notes. Tables must be self-contained: never use footnote symbols such as *, #, \\*, or \\# in table cells. If the source table uses footnotes, rewrite them as a Notes column or as short bullets immediately under the table. If adult and children regimens are present, use separate tables or clear headings; never put Adults or Children as a blank body row inside a table. Ignore publisher details, ISBN, copyright, preface, acknowledgements, and generic book disclaimers unless clinically relevant. No greeting. No filler. Do not invent missing content.",
            },
            {
              role: "user",
              content:
                `Source: ${fileName}\n` +
                `Goal: Produce exam-ready notes for this section.\n` +
                `Section ${i + 1}/${batches.length}:\n\n` +
                batchText,
            },
          ],
        });

        if (sectionText) partials.push(cleanNotesMarkdown(sectionText));
      }

      let merged = await generateGeminiTextWithFallback({
        model: GEMINI_STUDY_MODEL,
        fallbackModel: GEMINI_EXAM_COACH_MODEL,
        enableThinking: true,
        temperature: 0.35,
        maxOutputTokens: MAX_OUTPUT_TOKENS_DEEP,
        messages: [
          {
            role: "system",
            content:
              "You are the DentAIstudy Notes engine — a senior dental educator, licensing exam coach, and medical education content editor. Create one polished exam-ready note sheet from the section notes. Start directly with the topic, then structure the answer with concise headings, core concepts, definitions, red flags, tables when useful, clinical reasoning, exam traps, and likely viva or MCQ angles. Use clean markdown only: correct heading punctuation, numbered headings with dots, bold labels, scannable bullets, and no raw asterisks. Use only ## and ### headings inside the note body. Never use ####, #####, or deeper heading levels. Tables must be self-contained: never use footnote symbols such as *, #, \\*, or \\# in table cells. If a table has adult and children regimens, make the age group clear using separate tables or clear headings, not blank table rows. Remove repeated points and publisher/admin material. No greeting. No filler.",
          },
          {
            role: "user",
            content:
              `Source: ${fileName}\n` +
              `Deliverable: Complete exam-ready notes from the uploaded PDF.\n\n` +
              partials
                .map(
                  (part, index) =>
                    `--- Section Notes ${index + 1} ---\n${part}`,
                )
                .join("\n\n"),
          },
        ],
      });

      merged = cleanNotesMarkdown(merged);

      return new Response(JSON.stringify({ output: merged }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (task === "flashcards") {
      const cardCount = clampInt(body?.card_count, 6, 30, 12);
      const requestedCardCount = cardCount + countBuffer(cardCount);
      const sourceText = truncateText(
        [
          topic,
          ...(messagesFromClient || []).map(
            (m: any) => `${m.role}: ${m.content}`,
          ),
        ]
          .filter(Boolean)
          .join("\n\n"),
        18000,
      );

      if (sourceText.length < 30) {
        return new Response(JSON.stringify({ error: "SOURCE_REQUIRED" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const flashcardMaxTokens = Math.min(
        8000,
        Math.max(3200, requestedCardCount * 220 + 600),
      );

      const aiText = await generateGeminiTextWithFallback({
        model: GEMINI_STUDY_MODEL,
        fallbackModel: GEMINI_EXAM_COACH_MODEL,
        temperature: 0.38,
        maxOutputTokens: flashcardMaxTokens,
        responseMimeType: "application/json",
        responseSchema: FLASHCARD_RESPONSE_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are the DentAIstudy exam tutor — a senior dental educator and licensing exam coach. " +
              "Generate active-recall flashcards that train exam thinking, not passive memorisation. " +
              "Front: a specific clinical or exam-style question, hard enough to be useful. " +
              "Back: a direct complete answer with exam-critical nuance in 2-3 concise sentences, max 50 words. " +
              "Prioritise high-yield clinical facts, classifications, contraindications, viva traps, and common student errors. " +
              "Output valid JSON only. No preamble. No markdown.",
          },
          {
            role: "user",
            content:
              `Create exactly ${requestedCardCount} active-recall flashcards from the source. ` +
              "Avoid duplicates. Keep questions specific and answers concise but useful. " +
              'Return this schema: {"title":"short deck title","cards":[{"front":"question","back":"answer"}]}\n\n' +
              `Source:\n${sourceText}`,
          },
        ],
      });

      const parsed = parseJsonObject(aiText);
      let cards = normalizeFlashcards(pickFlashcardItems(parsed));
      let salvaged = !parsed;

      if (!cards.length) {
        cards = normalizeFlashcards(
          salvageArrayItems(aiText, ["cards", "flashcards", "items"]),
        );
        salvaged = true;
      }

      if (cards.length < cardCount) {
        try {
          const topUp = await topUpFlashcards({
            sourceText,
            existingFronts: cards.map((card) => card.front),
            needed: cardCount - cards.length,
          });

          const seen = new Set(cards.map((card) => card.front.toLowerCase()));

          for (const card of topUp) {
            if (cards.length >= cardCount) break;
            if (seen.has(card.front.toLowerCase())) continue;

            cards.push(card);
            seen.add(card.front.toLowerCase());
          }

          salvaged = true;
        } catch (_) {
          // Best-effort top-up. Return the valid cards we already have.
        }
      }

      cards = cards.slice(0, cardCount);

      if (cards.length < cardCount) {
        await refundAiCredit(supabaseAdmin, creditRefundSnapshot);

        if (!cards.length) {
          console.error("FLASHCARDS_PARSE_EMPTY", aiText.slice(0, 800));
          return new Response(
            JSON.stringify({
              error: "FLASHCARDS_EMPTY",
              message:
                "Could not generate flashcards from this note. Try again.",
            }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "FLASHCARDS_INCOMPLETE",
            message: `Only ${cards.length} of ${cardCount} flashcards could be generated from this note. Try a lower count or a longer note.`,
            requested_count: cardCount,
            generated_count: cards.length,
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          title: String(parsed?.title || "Study deck").slice(0, 90),
          cards,
          requested_count: cardCount,
          generated_count: cards.length,
          salvaged,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (task === "quiz") {
      const questionCount = clampInt(body?.question_count, 5, 30, 10);
      const requestedQuestionCount = questionCount + countBuffer(questionCount);
      const difficulty = ["easy", "normal", "hard"].includes(
        String(body?.difficulty),
      )
        ? String(body?.difficulty)
        : "normal";
      const sourceText = truncateText(
        [
          topic,
          ...(messagesFromClient || []).map(
            (m: any) => `${m.role}: ${m.content}`,
          ),
        ]
          .filter(Boolean)
          .join("\n\n"),
        18000,
      );

      if (sourceText.length < 30) {
        return new Response(JSON.stringify({ error: "SOURCE_REQUIRED" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const quizMaxTokens = Math.min(
        9000,
        Math.max(4600, requestedQuestionCount * 380 + 600),
      );

      const aiText = await generateGeminiTextWithFallback({
        model: GEMINI_STUDY_MODEL,
        fallbackModel: GEMINI_EXAM_COACH_MODEL,
        temperature: difficulty === "hard" ? 0.35 : 0.25,
        maxOutputTokens: quizMaxTokens,
        responseMimeType: "application/json",
        responseSchema: QUIZ_RESPONSE_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are the DentAIstudy exam writer — a senior dental educator who writes licensing-style dental questions. " +
              "Use realistic clinical stems and plausible distractors based on mistakes real students make. " +
              "Explanations must state why the correct answer is correct and why distractors fail in 1-2 concise sentences, max 45 words. " +
              "Output valid JSON only. No preamble. No markdown.",
          },
          {
            role: "user",
            content:
              `Create exactly ${requestedQuestionCount} multiple-choice questions from the source. ` +
              `Difficulty calibration:\n${QUIZ_DIFFICULTY_SPEC[difficulty]}\n\n` +
              "Each question needs 4 options, one correct answer, and a short explanation. Avoid duplicates. " +
              'Return this schema: {"title":"short quiz title","questions":[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]}\n\n' +
              `Source:\n${sourceText}`,
          },
        ],
      });

      const parsed = parseJsonObject(aiText);
      let questions = normalizeQuizQuestions(pickQuizItems(parsed));
      let salvaged = !parsed;

      if (!questions.length) {
        questions = normalizeQuizQuestions(
          salvageArrayItems(aiText, ["questions", "quiz", "mcqs", "items"]),
        );
        salvaged = true;
      }

      if (questions.length < questionCount) {
        try {
          const topUp = await topUpQuizQuestions({
            sourceText,
            existingQuestions: questions.map((question) => question.question),
            needed: questionCount - questions.length,
            difficulty,
          });

          const seen = new Set(
            questions.map((question) => question.question.toLowerCase()),
          );

          for (const question of topUp) {
            if (questions.length >= questionCount) break;
            if (seen.has(question.question.toLowerCase())) continue;

            questions.push(question);
            seen.add(question.question.toLowerCase());
          }

          salvaged = true;
        } catch (_) {
          // Best-effort top-up. Return the valid questions we already have.
        }
      }

      questions = questions.slice(0, questionCount);

      if (questions.length < questionCount) {
        await refundAiCredit(supabaseAdmin, creditRefundSnapshot);

        if (!questions.length) {
          console.error("QUIZ_PARSE_EMPTY", aiText.slice(0, 800));
          return new Response(
            JSON.stringify({
              error: "QUIZ_EMPTY",
              message:
                "Could not generate quiz questions from this note. Try again.",
            }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "QUIZ_INCOMPLETE",
            message: `Only ${questions.length} of ${questionCount} quiz questions could be generated from this note. Try a lower count or a longer note.`,
            requested_count: questionCount,
            generated_count: questions.length,
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          title: String(parsed?.title || "Study quiz").slice(0, 90),
          questions,
          requested_count: questionCount,
          generated_count: questions.length,
          difficulty,
          salvaged,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Exam Coach is text-only. Notes handles PDF-to-notes earlier in the chapter_notes branch.
    const latestUserQuestion =
      topic ||
      (messagesFromClient
        ?.slice()
        .reverse()
        .find((m: any) => m.role === "user")?.content ??
        "");

    const questionLine = topic ? `Current user question: ${topic}` : "";

    const mcqIntentDetected = hasMcqIntent(latestUserQuestion);
    const requestedMcqCount = detectRequestedMcqCount(latestUserQuestion);
    const effectiveMode = mcqIntentDetected ? "MCQ" : mode;

    const modeExplanation = (() => {
      const l = effectiveMode.toLowerCase();
      if (l.includes("osce")) {
        return "OSCE MODE — answer in examiner checklist format: introduction, history, examination, investigations, diagnosis/differential, management, follow-up, and mark-scoring points.";
      }
      if (l.includes("flashcard")) {
        return "FLASHCARD MODE — produce active-recall Q/A pairs that test clinical reasoning and exam traps.";
      }
      if (l.includes("mcq")) {
        return (
          "MCQ MODE — strict format, no exceptions, applies whenever user requests questions regardless of mode:\n\n" +
          "START RULE: The very first characters of the response must be '**Question 1:**' — nothing before it. No sentence about the PDF. No sentence about what you are generating. No 'Here are your questions:'. Start cold on Question 1.\n\n" +
          "EXACT FORMAT per question — follow this precisely:\n\n" +
          "**Question [N]:**\n" +
          "[Clinical scenario — 2 to 4 sentences. Patient age or context, presenting complaint, key clinical or radiographic findings. End with a specific answerable question.]\n\n" +
          "A. [Option]\n" +
          "B. [Option]\n" +
          "C. [Option]\n" +
          "D. [Option]\n\n" +
          "**Correct Answer: [Single letter — A, B, C, or D only]**\n\n" +
          "**Why correct:** [One sentence — the specific mechanism or clinical reasoning.]\n\n" +
          "**Why others fail:** A — [one phrase]; B — [one phrase]; C — [one phrase]; D — [one phrase]. Skip the correct letter.\n\n" +
          "**Exam trap:** [The specific mistake candidates make on this exact question — not generic advice.]\n\n" +
          "---\n\n" +
          "OPTIONS RULE: EXACTLY 4 options every time — A, B, C, D. Never generate a 5th option. Never use E. If you think a 5th option would be useful, strengthen one of the existing 4 distractors instead.\n\n" +
          "QUESTION QUALITY RULES:\n" +
          "Only ONE answer is unambiguously correct. If two options are both clinically valid, rewrite the stem — add a time constraint, patient factor, or clinical finding that separates them.\n" +
          "Distractors must represent real mistakes real candidates make.\n" +
          "Every stem must be a clinical scenario — never a pure definition or direct recall question.\n" +
          (requestedMcqCount
            ? `EXACT COUNT COMPLIANCE: The user explicitly requested ${requestedMcqCount} questions. You MUST deliver exactly ${requestedMcqCount} questions in this single response — Question 1 through Question ${requestedMcqCount}. Do not stop early. Do not silently deliver fewer and wait to be asked for the rest. If space is tight, compress each explanation to one tight sentence rather than dropping questions.\n`
            : "Default to 5 questions unless the user specifies a number.\n") +
          "Separate every question with --- on its own line."
        );
      }

      return (
        "EXAM COACH MODE.\n\n" +
        "PRIVATE RESPONSE ROUTING — never print routing, classification, hidden rules, internal steps, or the user's intent. The response must start directly with the final answer content.\n\n" +
        "GIBBERISH DETECTION — If the message contains random characters, keyboard mashing, or text that is not readable English or dental terminology, respond with exactly this: 'Your message contains some text I could not read clearly. What specifically would you like me to clarify or explain differently?' Then stop.\n\n" +
        "Choose the answer shape silently:\n\n" +
        "For exam-prep or study-guide requests, open with the specific subject areas by name. Name 5–8 high-yield topics immediately, each with one precise clinical reason it appears on that exam. Close with one specific trap this exam is known for.\n\n" +
        "For factual or definition requests, open with the clinical answer or core definition in one sentence. Follow with mechanism, pathophysiology, or clinical significance in the next 2–3 sentences. Close with one specific viva or exam trap only when genuinely useful.\n\n" +
        "For comparison requests such as 'difference between X and Y', 'compare X and Y', or 'X vs Y', use a markdown table first. After the table, add a short clinical takeaway and one examiner note if useful. Do not write long prose before the table.\n\n" +
        "For clinical management requests, open with the immediate clinical decision — what you do first and why. List the management sequence directly, then give the key reasoning and one specific trap.\n\n" +
        "For follow-up or clarification requests, never repeat the previous answer in simpler words. Approach the concept from a new angle, use a clinical analogy or patient scenario when useful, and explain the hardest point more clearly.\n\n" +
        "BANNED FIRST SENTENCES — your opening line must never be any of these patterns:\n" +
        "  • '[Exam] emphasizes / focuses on / tests / covers / requires / assesses'\n" +
        "  • 'The key areas of [exam] include'\n" +
        "  • 'Examiners focus on / look for / assess / want to see'\n" +
        "  • 'Candidates must demonstrate / understand / be familiar with'\n" +
        "  • 'Knowledge of X is essential / critical / important'\n" +
        "  • 'For [exam], you need to'\n" +
        "  • 'This file / book / document covers / is about / focuses on / contains'\n" +
        "  • 'Understanding X is crucial / vital / key'\n" +
        "The first sentence IS the answer. Not a sentence that introduces, frames, or describes the answer.\n\n" +
        "PARAGRAPH FORMATTING:\n" +
        "  • Maximum 3 sentences per paragraph, then a blank line\n" +
        "  • The exam trap always opens on its own standalone paragraph\n" +
        "  • A single sentence as its own paragraph is correct when the point deserves emphasis\n" +
        "  • Bullets are allowed when a genuine list exists — never forced\n" +
        "  • Tables are preferred for direct comparisons, material properties, classifications, drugs, and indications\n\n" +
        "LENGTH — scale to question complexity, not to a fixed cap:\n" +
        "  • Single concept question: 150–220 words\n" +
        "  • Comparison question: table plus 80–160 words of clinical takeaway\n" +
        "  • Multi-topic or exam-prep question: 350–550 words — name every relevant area, do not stop early\n" +
        "  • Complex multi-part question: answer every part fully, no word ceiling\n" +
        "  • Clinical management question: 200–350 words depending on condition complexity\n" +
        "Never pad with filler sentences to reach a minimum. Never stop before finishing a genuine answer to reach a maximum. The right length is: every part of the question answered, every high-yield point included, nothing that doesn't earn its place.\n\n" +
        "TRAP QUALITY: The trap must name a specific real mistake for this exact topic and this exact exam. If the same trap could apply to any dental question, it is filler — cut it. If you cannot identify a specific real trap, omit the trap section entirely. An absent trap is better than a generic one."
      );
    })();

    const systemPrompt =
      "You are the DentAIstudy tutor — a senior dental educator and licensing exam coach for INBDE, ORE, ADC, NDECC, SDLE, DHA, MOH, and DOH candidates. You answer with the standard of a viva examiner: precise, structured, clinically grounded, and high-yield.\n\n" +
      "IDENTITY & STANDARD\n" +
      "Think like an examiner, teach like an excellent clinical professor, and answer like a confident senior colleague briefing a junior dentist. The user should leave with exam-ready understanding, not a generic summary.\n\n" +
      "AUDIENCE\n" +
      "Users are dental students, interns, residents, and qualified dentists. They have dental training. Do not explain basic dentistry at patient level unless asked. If the user asks a clearly unrelated question, redirect in one sentence to dental learning.\n\n" +
      "TONE — NON-NEGOTIABLE\n" +
      "Never open with: Certainly, Of course, Hello, Great question, Sure, Absolutely, I'd be happy to help, Glad you asked, That's a great topic.\n" +
      "Never close with: I hope this helps, Feel free to ask more, Let me know if you have questions.\n" +
      "BANNED RESPONSE OPENERS — these are also forbidden, no exceptions:\n" +
      "  • 'Here are [N] questions / MCQs / flashcards on [topic]:'\n" +
      "  • 'I will explain...'\n" +
      "  • 'Let's discuss...'\n" +
      "  • 'The answer is as follows...'\n" +
      "MCQ START RULE: Every MCQ response must begin with the characters '**Question 1:**' — nothing before it, no preamble, no sentence about what you are generating.\n" +
      "No hollow acknowledgement. No corporate filler. Every word must earn its place.\n\n" +
      "ANSWER ARCHITECTURE\n" +
      "Layer 1: Direct answer — state the core fact or clinical decision immediately.\n" +
      "Layer 2: The why — mechanism, rationale, pathophysiology, or clinical reasoning.\n" +
      "Layer 3: The exam hook — what examiners test, the common trap, or the clinical consequence.\n" +
      "Exam Coach keeps this structure focused: direct answer first, clinical reasoning second, examiner trap only when useful.\n\n" +
      "ANTICIPATE THE REAL NEED\n" +
      "Answer the question asked, then ask yourself what a good examiner expects the student to know adjacent to this topic. If there is a high-value insight the student clearly needs but did not ask for — a clinical consequence, contraindication, viva trap, or common student error — include it at the end under **Examiner note:**. Use this sparingly, only when genuinely valuable. Do not pad.\n\n" +
      "TOPIC FIDELITY — NON-NEGOTIABLE\n" +
      "Before answering, identify the exact subject the user named — a specific appliance, condition, drug, technique, or classification. If the term contains an obvious typo (e.g., 'bionater' for 'Bionator'), silently correct the spelling and answer about that exact corrected term. Never substitute a different, even closely related, subject for the one named — naming Twin Block when the user asked about Bionator is a hard failure, not a stylistic choice, even though both are Class II functional appliances.\n" +
      "If the term is genuinely ambiguous between two distinct valid dental terms, ask one short clarifying question instead of guessing.\n" +
      "SELF-CHECK before sending: does every question, fact, and explanation in this response refer to the literal subject the user named (after typo correction) — not a related but different one? If not, rewrite before responding.\n\n" +
      "FORMATTING\n" +
      "Use clean markdown like a professional medical education content editor. Use headings only when they improve scanning. Use bullets for genuine lists and tables for comparisons, classifications, drugs, indications, contraindications, material properties, and dose-style information. Numbered items must use a dot after the number, e.g. `1. Diagnosis` — never `1 Diagnosis`. Use **bold** for labels and *italic* only for true emphasis; never leave raw asterisks in the final answer. Do not write unbroken prose longer than 80 words. Do not over-format simple answers.\n\n" +
      "EXAM CALIBRATION\n" +
      "ORE: UK clinical reasoning, GDC standards, NICE/FGDP/BSP guidelines, UK drug names and terminology.\n" +
      "INBDE: US/ADA standards, evidence-based NBDE-style clinical reasoning.\n" +
      "ADEX: American Dental Association Examination Services — US exam, ADA guidelines, state board clinical standards. NOT Australian. Do not confuse with ADC.\n" +
      "ADC: Australian Dental Council — Australian/AHPRA context, Australian guidelines, practical and written exam balance.\n" +
      "NDECC: Canadian context, NDEB standards.\n" +
      "SDLE/DHA/MOH/DOH: Gulf licensing context, Saudi/UAE clinical standards.\n" +
      "If no exam is specified, use internationally applicable evidence-based dentistry.\n\n" +
      "EXAM CONTEXT PERSISTENCE\n" +
      "If the user has mentioned their target exam anywhere in this conversation — ORE, INBDE, ADC, NDECC, SDLE, DHA, MOH, or DOH — maintain that exam calibration for every answer in this session. Do not drift back to generic standards unless the user explicitly changes their exam context.\n\n" +
      "MCQ INTENT OVERRIDE: If the user's message contains a request for MCQs, questions, quiz items, or practice questions, apply the full MCQ format architecture. The user asking for questions means they want practice questions, not a prose explanation.\n\n" +
      "CLINICAL BOUNDARY\n" +
      "DentAIstudy is a study and exam-prep tool. For acute real patient emergencies, direct the user to a supervising clinician or emergency care. For exam prep and clinical case discussion, answer fully and clinically without unnecessary disclaimers.";

    const baseUserPrompt = [
      `Subject: ${subject}`,
      "Product area: Exam Coach",
      questionLine,
      `Instruction: ${modeExplanation}`,
      "Target depth: exam-focused answer with clinical reasoning, high-yield structure, and no filler.",
      "\nKeep the answer exam-relevant, clinical, and direct.",
    ]
      .filter(Boolean)
      .join("\n");

    const safeHistory = (
      Array.isArray(messagesFromClient) ? messagesFromClient : []
    )
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-HISTORY_WINDOW)
      .map((m) => ({
        role: m.role,
        content: truncateText(String(m.content || ""), MAX_MESSAGE_CHARS),
      }));

    const finalMessages = [
      {
        role: "system",
        content: systemPrompt + "\n\n---\nSESSION CONTEXT\n" + baseUserPrompt,
      },
      ...safeHistory,
    ];

    const mcqScaledTokens = mcqIntentDetected
      ? Math.min(
          9000,
          Math.max(MAX_OUTPUT_TOKENS_QA, (requestedMcqCount || 5) * 450 + 800),
        )
      : null;

    let content = await generateGeminiText({
      model: GEMINI_EXAM_COACH_MODEL,
      messages: finalMessages,
      temperature: 0.4,
      maxOutputTokens: mcqScaledTokens ?? MAX_OUTPUT_TOKENS_QA,
    });

    content = cleanExamCoachLeakage(content);

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI_GENERATION_ERROR", e);
    return new Response(JSON.stringify({ error: "AI_GENERATION_ERROR" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
