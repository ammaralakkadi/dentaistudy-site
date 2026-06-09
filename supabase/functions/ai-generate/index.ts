import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FREE_DAILY_LIMIT = 20;
const PRO_DAILY_LIMIT = 200;

// Safety nets
const HISTORY_WINDOW = 14;
const MAX_MESSAGE_CHARS = 6000;
const MAX_OUTPUT_TOKENS_QA = 2000;
const MAX_OUTPUT_TOKENS_DEEP = 4000;

// RAG settings
const GEMINI_QUICK_MODEL = "gemini-2.5-flash-lite";
const GEMINI_DEEP_MODEL = "gemini-2.5-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 1536;
const RETRIEVE_TOP_K = 8;
const MAX_CONTEXT_CHARS = 14000;

// Indexing caps (cost control)
const MAX_INDEX_CHARS_PER_FILE = 60_000;
const CHUNK_CHARS = 2500;
const CHUNK_OVERLAP = 150;

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function truncateText(text: string, maxChars: number): string {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
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

  const res = await fetchGeminiWithBackoff(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
    requestBody,
    GEMINI_API_KEY,
  );

  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : null;

  if (!res.ok) {
    // Keep existing error shape but include status for fallback decisions
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

async function generateGeminiTextWithDeepFallback(options: {
  // If deep model errors with 429/503/5xx, fallback to lite.
  // Keep frontend response shapes identical (only content changes).
  deepModel: string;
  liteModel: string;
  isDeep: boolean;
  messages: GeminiMessage[];
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: string;
  enableThinking?: boolean;
}): Promise<string> {
  if (!options.isDeep) {
    return generateGeminiText({
      model: options.liteModel,
      messages: options.messages,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      responseMimeType: options.responseMimeType,
    });
  }

  try {
    return await generateGeminiText({
      model: options.deepModel,
      messages: options.messages,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      responseMimeType: options.responseMimeType,
      enableThinking: options.enableThinking,
    });
  } catch (e: any) {
    const status = Number(e?.status ?? null);
    if (isGeminiRateOrTransient(Number.isFinite(status) ? status : null)) {
      return await generateGeminiText({
        model: options.liteModel,
        messages: options.messages,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: options.responseMimeType,
      });
    }
    throw e;
  }
}

function forceEmbeddingTo1536(values: unknown): number[] {
  // We must guarantee the DB insert matches EMBEDDING_DIMENSIONS.
  const arr = Array.isArray(values) ? values : [];
  const nums = arr.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));

  if (nums.length === EMBEDDING_DIMENSIONS) return nums;
  if (nums.length > EMBEDDING_DIMENSIONS) {
    // deterministic truncation
    return nums.slice(0, EMBEDDING_DIMENSIONS);
  }

  // pad with zeros
  const out = nums.slice();
  while (out.length < EMBEDDING_DIMENSIONS) out.push(0);
  return out;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const cleanTexts = texts.map((text) => String(text || "").trim());
  if (!cleanTexts.length) return [];

  const res = await fetchGeminiWithBackoff(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
    {
      requests: cleanTexts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        embedContentConfig: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      })),
    },
    GEMINI_API_KEY,
  );

  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : null;

  if (!res.ok) {
    throw new Error(`EMBEDDINGS_ERROR ${res.status}: ${raw.slice(0, 500)}`);
  }

  const embeddings = Array.isArray(json?.embeddings) ? json.embeddings : [];
  return embeddings
    .map((item: any) => forceEmbeddingTo1536(item?.values))
    .slice(0, cleanTexts.length);
}

// Parses text that contains page markers like: [Page 3]
function splitIntoPages(
  text: string,
): Array<{ page: number | null; text: string }> {
  const t = (text || "").slice(0, MAX_INDEX_CHARS_PER_FILE);

  // If no page markers, treat as single "page"
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

async function indexPdfDocs(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  conversationId: string,
  pdfDocs: PdfDoc[],
) {
  for (const doc of pdfDocs) {
    const fileId = String(doc.file_id || "").trim();
    const fileName = String(doc.file_name || "").trim() || null;
    const text = String(doc.text || "").trim();
    if (!fileId || !text) continue;

    // Replace old chunks for this file in this conversation (clean + simple)
    await supabaseAdmin
      .from("pdf_chunks")
      .delete()
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("file_id", fileId);

    const pages = splitIntoPages(text);

    let chunkIndex = 0;
    const rows: any[] = [];

    for (const p of pages) {
      const parts = chunkText(p.text);
      for (const part of parts) {
        rows.push({
          user_id: userId,
          conversation_id: conversationId,
          file_id: fileId,
          file_name: fileName,
          page_start: p.page,
          page_end: p.page,
          chunk_index: chunkIndex++,
          content: part,
          embedding: [], // fill after embedding
        });
      }
    }

    if (!rows.length) continue;

    // Embed in batches
    const BATCH = 48;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batchRows = rows.slice(i, i + BATCH);
      const batchTexts = batchRows.map((r) => r.content);
      const embeds = await embedTexts(batchTexts);
      for (let j = 0; j < batchRows.length; j++) {
        // Ensure each row embeds exactly 1536 dims
        batchRows[j].embedding = forceEmbeddingTo1536(embeds[j]);
      }
    }

    const { error } = await supabaseAdmin.from("pdf_chunks").insert(rows);
    if (error) {
      console.error("PDF_INDEX_INSERT_ERROR", error);
      // don't throw hard — user can still chat without PDF
    }
  }
}

function buildRagContext(chunks: any[]): string {
  let out = "";
  for (const c of chunks || []) {
    const page =
      c.page_start == null
        ? ""
        : ` (page ${c.page_start}${
            c.page_end && c.page_end !== c.page_start ? `-${c.page_end}` : ""
          })`;
    const header = `\n--- ${c.file_name || "PDF"}${page} ---\n`;
    const block = header + String(c.content || "").trim() + "\n";
    if (out.length + block.length > MAX_CONTEXT_CHARS) break;
    out += block;
  }
  return out.trim();
}

async function fetchAllChunksForFile(
  supabaseAdmin: any,
  userId: string,
  conversationId: string,
  fileId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("pdf_chunks")
    .select("chunk_index,page_start,page_end,content,file_name")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .eq("file_id", fileId)
    .order("chunk_index", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

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

function normalizeFlashcards(
  value: any,
): Array<{ front: string; back: string }> {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((card: any) => ({
      front: String(card?.front ?? card?.question ?? "").trim(),
      back: String(card?.back ?? card?.answer ?? "").trim(),
    }))
    .filter((card) => card.front && card.back)
    .slice(0, 30);
}

function normalizeQuizQuestions(value: any) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((item: any) => {
      const options = Array.isArray(item?.options)
        ? item.options
            .map((option: unknown) => String(option ?? "").trim())
            .filter(Boolean)
            .slice(0, 5)
        : [];

      const correctIndex = Number(
        item?.correct_index ?? item?.answer_index ?? 0,
      );

      return {
        question: String(item?.question ?? "").trim(),
        options,
        correct_index: Number.isInteger(correctIndex) ? correctIndex : 0,
        explanation: String(item?.explanation ?? "").trim(),
      };
    })
    .filter(
      (item) =>
        item.question &&
        item.options.length >= 3 &&
        item.correct_index >= 0 &&
        item.correct_index < item.options.length,
    )
    .slice(0, 25);
}

function isPdfOverviewIntent(text: string): boolean {
  const t = String(text || "").toLowerCase();
  return (
    /\b(what is this file|what is this document|what is this talking about|overview|summar(y|ize)|high[- ]level|big picture|what does it cover|what is it about)\b/.test(
      t,
    ) || /^\s*(what\s+is\s+this\s+file\s+about\??)\s*$/i.test(t)
  );
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

  if (
    !GEMINI_API_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SUPABASE_ANON_KEY
  ) {
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

    // User-context client (anon + user JWT): RLS + auth.uid() works inside RPC
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    // Identify user
    let userId: string | null = null;
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const jwt = authHeader.slice(7).trim();
      const { data } = await supabaseAdmin.auth.getUser(jwt);
      if (data?.user) userId = data.user.id;
    }

    // Enforce signed-in for PDF indexing/retrieval
    const canUsePdf = Boolean(userId && conversationId);

    let subscriptionTier = "free";
    let isProUser = false;

    // Rate limit (your existing logic)
    if (userId) {
      const today = getTodayUTC();
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (data?.user) {
        const userMeta: any = data.user.user_metadata ?? {};
        const appMeta: any = data.user.app_metadata ?? {};
        const tier = appMeta.subscription_tier || "free";
        const isPro = tier === "pro" || tier === "pro_yearly";
        subscriptionTier = tier;
        isProUser = isPro;
        const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

        let used =
          typeof userMeta.ai_count === "number" ? userMeta.ai_count : 0;
        let date =
          typeof userMeta.ai_date === "string" ? userMeta.ai_date : null;

        if (date !== today) {
          used = 0;
          date = today;
        }

        if (used >= limit) {
          return new Response(
            JSON.stringify({ error: "LIMIT_REACHED", tier, limit }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { ...userMeta, ai_date: today, ai_count: used + 1 },
        });
      }
    }

    if ((task === "flashcards" || task === "quiz") && !isProUser) {
      return new Response(
        JSON.stringify({ error: "PRO_REQUIRED", tier: subscriptionTier }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If PDFs arrived with this message: index them now (chat-scoped via conversation_id)
    if (canUsePdf && pdfDocs.length) {
      await indexPdfDocs(supabaseAdmin, userId!, conversationId, pdfDocs);
    }

    if (task === "flashcards") {
      const cardCount = clampInt(body?.card_count, 6, 30, 12);
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

      const aiText = await generateGeminiText({
        model: GEMINI_QUICK_MODEL,
        temperature: 0.38,
        maxOutputTokens: 2600,
        responseMimeType: "application/json",
        messages: [
          {
            role: "system",
            content:
              "You are the DentAIstudy exam tutor — a senior dental educator and licensing exam coach. " +
              "Generate active-recall flashcards that train exam thinking, not passive memorisation. " +
              "Front: a specific clinical or exam-style question, hard enough to be useful. " +
              "Back: a direct complete answer with any exam-critical nuance and the reason behind the fact. " +
              "Prioritise high-yield clinical facts, classifications, contraindications, viva traps, and common student errors. " +
              "Output valid JSON only. No preamble. No markdown.",
          },
          {
            role: "user",
            content:
              `Create exactly ${cardCount} active-recall flashcards from the source. ` +
              "Avoid duplicates. Keep questions specific and answers concise but useful. " +
              'Return this schema: {"title":"short deck title","cards":[{"front":"question","back":"answer"}]}\n\n' +
              `Source:\n${sourceText}`,
          },
        ],
      });

      const parsed = parseJsonObject(aiText);
      const cards = normalizeFlashcards(parsed?.cards);

      return new Response(
        JSON.stringify({
          title: String(parsed?.title || "Study deck").slice(0, 90),
          cards,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (task === "quiz") {
      const questionCount = clampInt(body?.question_count, 5, 25, 10);
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

      const aiText = await generateGeminiText({
        model: GEMINI_QUICK_MODEL,
        temperature: difficulty === "hard" ? 0.35 : 0.25,
        maxOutputTokens: 3600,
        responseMimeType: "application/json",
        messages: [
          {
            role: "system",
            content:
              "You are the DentAIstudy exam writer — a senior dental educator who writes licensing-style dental questions. " +
              "Generate MCQs that test clinical reasoning and decision-making, not isolated fact recall. " +
              "Use realistic clinical stems and plausible distractors based on mistakes real students make. " +
              "Explanations must state why the correct answer is correct and why the distractors fail. " +
              "Output valid JSON only. No preamble. No markdown.",
          },
          {
            role: "user",
            content:
              `Create exactly ${questionCount} ${difficulty} multiple-choice questions from the source. ` +
              "Each question needs 4 options, one correct answer, and a short explanation. Avoid duplicates. " +
              'Return this schema: {"title":"short quiz title","questions":[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]}\n\n' +
              `Source:\n${sourceText}`,
          },
        ],
      });

      const parsed = parseJsonObject(aiText);
      const questions = normalizeQuizQuestions(parsed?.questions);

      return new Response(
        JSON.stringify({
          title: String(parsed?.title || "Study quiz").slice(0, 90),
          questions,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Retrieve top-k relevant chunks unless the user clearly asks for full PDF notes
    const isDeepStudy = task === "chapter_notes";
    const latestUserQuestion =
      topic ||
      (messagesFromClient
        ?.slice()
        .reverse()
        .find((m: any) => m.role === "user")?.content ??
        "");

    const questionLine = topic ? `Current user question: ${topic}` : "";

    const wantsFullPdfNotes =
      /\b(full chapter notes|complete chapter notes|full pdf notes|whole pdf notes|entire pdf notes|complete exam sheet|study sheet from the full pdf|make notes from the full pdf)\b/i.test(
        latestUserQuestion,
      );

    const canBuildPdfChapterNotes = Boolean(
      canUsePdf && isDeepStudy && activeFileId && wantsFullPdfNotes,
    );

    const isOverview = canUsePdf && isPdfOverviewIntent(latestUserQuestion);

    let ragContext = "";
    if (canUsePdf && !canBuildPdfChapterNotes) {
      try {
        if (isOverview && activeFileId) {
          const overviewChunks = await fetchAllChunksForFile(
            supabaseAdmin,
            userId!,
            conversationId,
            activeFileId,
          );

          // File overview should come from the document front matter and contents,
          // not from one semantically similar chapter hit.
          ragContext = buildRagContext(overviewChunks.slice(0, 14));
        }

        if (!ragContext && latestUserQuestion) {
          const retrievalQuestion = isOverview
            ? "title author preface foreword contents chapters sections dental specialties exam preparation overview"
            : latestUserQuestion;
          const [qEmbed] = await embedTexts([retrievalQuestion]);

          const { data } = await supabaseUser.rpc("match_pdf_chunks", {
            p_conversation_id: conversationId,
            p_query_embedding: qEmbed,
            p_match_count: isOverview
              ? Math.max(RETRIEVE_TOP_K * 2, 12)
              : RETRIEVE_TOP_K,
          });

          ragContext = buildRagContext(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error("RAG_RETRIEVE_ERROR", e);
      }
    }

    // Full PDF chapter notes only when a PDF is actually available
    if (canBuildPdfChapterNotes) {
      const allChunks = await fetchAllChunksForFile(
        supabaseAdmin,
        userId!,
        conversationId,
        activeFileId,
      );

      if (!allChunks.length) {
        return new Response(JSON.stringify({ error: "NO_CHUNKS_FOUND" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const batches = makeBatchesByCharLimit(allChunks, 12000);
      const partials: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batchText = formatBatch(batches[i]);

        const sectionText = await generateGeminiTextWithDeepFallback({
          deepModel: GEMINI_DEEP_MODEL,
          liteModel: GEMINI_QUICK_MODEL,
          isDeep: true,
          temperature: 0.25,
          maxOutputTokens: MAX_OUTPUT_TOKENS_QA,
          messages: [
            {
              role: "system",
              content:
                "You are the DentAIstudy exam tutor — a senior dental educator and licensing exam coach. Create exam-ready notes from the provided text ONLY. " +
                "Use direct headings, high-yield bullets, mechanisms, clinical relevance, and exam traps where supported. " +
                "No greeting. No filler. Do NOT invent missing content.",
            },
            {
              role: "user",
              content:
                `Subject: ${subject}\n` +
                `Goal: Produce exam-ready notes for this section.\n` +
                `Section ${i + 1}/${batches.length}:\n\n` +
                batchText,
            },
          ],
        });

        if (sectionText) partials.push(sectionText);
      }

      const merged = await generateGeminiTextWithDeepFallback({
        deepModel: GEMINI_DEEP_MODEL,
        liteModel: GEMINI_QUICK_MODEL,
        isDeep: true,
        temperature: 0.35,
        maxOutputTokens: MAX_OUTPUT_TOKENS_DEEP,
        messages: [
          {
            role: "system",
            content:
              "You are the DentAIstudy exam tutor — a senior dental educator and licensing exam coach. " +
              "Create one polished deep-study chapter sheet from the section notes. " +
              "Start directly with the topic, then structure the answer with concise headings, core concepts, definitions, red flags, tables when useful, and likely exam questions. " +
              "No greeting. No filler. No repeated points.",
          },
          {
            role: "user",
            content:
              `Subject: ${subject}\n` +
              `Deliverable: Complete exam sheet for the full chapter.\n\n` +
              partials
                .map((p, idx) => `--- Section Notes ${idx + 1} ---\n${p}`)
                .join("\n\n"),
          },
        ],
      });

      return new Response(JSON.stringify({ output: merged }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modeExplanation = (() => {
      if (isDeepStudy) {
        return (
          "DEEP STUDY MODE — full teaching answer with examiner-level structure. " +
          "Use the relevant sections only: direct answer, definition, classification, mechanism/pathophysiology, clinical features, investigations, management, high-yield exam notes, and common traps. " +
          "Do not pad. Depth means mechanism, clinical reasoning, and exam relevance — not filler."
        );
      }

      const l = mode.toLowerCase();
      if (l.includes("osce")) {
        return "OSCE MODE — answer in examiner checklist format: introduction, history, examination, investigations, diagnosis/differential, management, follow-up, and mark-scoring points.";
      }
      if (l.includes("flashcard")) {
        return "FLASHCARD MODE — produce active-recall Q/A pairs that test clinical reasoning and exam traps.";
      }
      if (l.includes("mcq")) {
        return (
          "MCQ MODE — strict format for every single question, no exceptions:\n\n" +
          "**Question [N]:** [Clinical scenario — 2 to 4 sentences. State patient age, chief complaint, clinical or radiographic findings, then ask the question.]\n\n" +
          "A. [Option]\n" +
          "B. [Option]\n" +
          "C. [Option]\n" +
          "D. [Option]\n\n" +
          "**Correct Answer: [Letter]**\n\n" +
          "**Why correct:** [One sentence — the specific mechanism or clinical reasoning that makes this the best answer.]\n\n" +
          "**Why others fail:** [One short phrase per wrong option — e.g., 'A — premature without radiographic staging; C — not first-line without systemic signs.']\n\n" +
          "**Exam trap:** [The exact mistake candidates make on this specific question — not generic advice.]\n\n" +
          "---\n\n" +
          "QUESTION QUALITY RULES:\n" +
          "Only ONE answer must be unambiguously correct. If two options are both clinically appropriate for the scenario, rewrite the stem to make the distinction clear — add a time constraint, a resource constraint, or a clinical finding that separates them.\n" +
          "Distractors must be plausible — use real mistakes real candidates make, not obviously wrong options.\n" +
          "Every stem must describe a clinical scenario. No pure definition questions.\n" +
          "Separate every question with --- on its own line."
        );
      }

      return (
        "QUICK ANSWER MODE.\n\n" +
        "STEP 1 — Before writing a single word, silently identify which question type this is:\n" +
        "TYPE A: Exam prep / study guide — 'What should I study for X', 'Important topics for X', 'What does [exam] test'\n" +
        "TYPE B: Factual or definition — 'What is X', 'Define X', 'Explain X', 'How does X work'\n" +
        "TYPE C: Clinical management — 'How do I manage X', 'Treatment of X', 'Patient presents with X'\n" +
        "TYPE D: PDF or file overview — 'What is this file about', 'Summarize this book', 'What does this document cover'\n" +
        "TYPE E: Follow-up or conversational — building directly on a prior answer in this session\n\n" +
        "STEP 2 — Apply the correct answer architecture for the type:\n\n" +
        "TYPE A — Exam prep:\n" +
        "Open with the specific subject areas by name — not a statement about the exam. Name 5–8 high-yield topics immediately, each with one precise clinical reason it appears on that exam. Do not describe what the exam values — demonstrate it by naming the actual content. Close with one specific trap this exam is known for: the exact area candidates neglect, the exact guideline they forget, or the exact reasoning step they skip.\n\n" +
        "TYPE B — Factual/definition:\n" +
        "Open with the clinical answer or core definition in one sentence. Follow with mechanism, pathophysiology, or clinical significance in the next 2–3 sentences. Close with one specific viva or exam trap on its own paragraph — the exact point examiners use to separate passing from failing answers.\n\n" +
        "TYPE C — Clinical management:\n" +
        "Open with the immediate clinical decision — what you do first and why. List the management priority or sequence directly. One sentence giving the critical reasoning behind the key step. Close with one trap — the step candidates skip, the contraindication they miss, or the complication they fail to anticipate.\n\n" +
        "TYPE D — PDF or file overview:\n" +
        "Block 1: Title, author, publication year if visible, intended audience. Two sentences maximum.\n" +
        "Block 2: A bullet list of the specific dental subjects and notable chapters. Name at least 6 specific topics you can see in the content — do not generalize.\n" +
        "Block 3: Which licensing exams or student levels this resource suits, what it does well as a revision tool, and one honest limitation based only on what you can see in the content — year of publication, regional calibration, or depth level.\n" +
        "TRAP RULE FOR TYPE D: Only add an exam trap if the PDF content itself supports a real and specific mistake. If no such trap is visible in the content, omit the trap entirely. A fabricated trap is worse than no trap.\n\n" +
        "TYPE E — Follow-up:\n" +
        "Answer as a direct continuation. Do not re-introduce the topic or repeat context from the prior answer. Reference earlier points only when it sharpens the current answer.\n\n" +
        "STEP 3 — Apply these rules to every type:\n\n" +
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
        "  • No bold section labels, headers, or tags — no 'Rationale:', 'Key Areas:', 'Exam Hook:'\n" +
        "  • Bullets are allowed when a genuine list exists — never forced\n\n" +
        "LENGTH: 150–280 words for Types A, B, C, E. Type D may run slightly longer to cover the chapter list properly. Never pad. Never truncate genuinely useful clinical content.\n\n" +
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
      "No hollow acknowledgement. No corporate filler. Start with the answer. Every word must earn its place.\n\n" +
      "ANSWER ARCHITECTURE\n" +
      "Layer 1: Direct answer — state the core fact or clinical decision immediately.\n" +
      "Layer 2: The why — mechanism, rationale, pathophysiology, or clinical reasoning.\n" +
      "Layer 3: The exam hook — what examiners test, the common trap, or the clinical consequence.\n" +
      "Quick mode compresses this structure. Deep mode expands it with headings.\n\n" +
      "ANTICIPATE THE REAL NEED\n" +
      "Answer the question asked, then ask yourself what a good examiner expects the student to know adjacent to this topic. If there is a high-value insight the student clearly needs but did not ask for — a clinical consequence, contraindication, viva trap, or common student error — include it at the end under **Examiner note:**. Use this sparingly, only when genuinely valuable. Do not pad.\n\n" +
      "FORMATTING\n" +
      "Use markdown headings and bullets when they improve scanning. Use tables for classifications, comparisons, drugs, or dose-style information. Do not write unbroken prose longer than 80 words. Do not over-format simple answers.\n\n" +
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
      "PDF SOURCE RULE\n" +
      "If PDF excerpts are provided, they are the primary source. Never claim the PDF is mainly about one topic unless the excerpts support that as the main theme. For a PDF overview, identify the document title/type, target audience, visible chapters/topics, and study value. If excerpts do not contain enough detail, say what is visible first, then clearly label any added clinical knowledge.\n\n" +
      "CLINICAL BOUNDARY\n" +
      "DentAIstudy is a study and exam-prep tool. For acute real patient emergencies, direct the user to a supervising clinician or emergency care. For exam prep and clinical case discussion, answer fully and clinically without unnecessary disclaimers.";

    const pdfAnswerRule = ragContext
      ? isOverview
        ? isDeepStudy
          ? "PDF overview rule: give a fuller structured overview of the attached file. Identify the title/type, author if visible, target audience, visible chapters/topics, how the content is organized, and the exam-study value. Use only supported excerpts. Do not over-focus on a single chapter unless the document itself is that chapter."
          : "PDF QUICK OVERVIEW — use this specific format. The RULE 6 word cap does not apply to this task.\n" +
            "Paragraph 1: Book title, author, publication year if visible, and who it is for. Two sentences maximum.\n" +
            "Paragraph 2: The actual subjects and chapters covered. Name the dental specialties and specific topics explicitly — minimum 6 items. Use a short bullet list if the chapter count is high.\n" +
            "Paragraph 3: Exam relevance — which licensing exams this book suits, what it does well as a revision resource, and one honest limitation based on the content itself (e.g., year of publication, regional calibration, depth level).\n" +
            "TRAP RULE: Only add an exam trap if it is directly supported by something in the PDF excerpts. If the excerpts do not contain material for a specific trap, omit the trap entirely. Do not invent traps."
        : isDeepStudy
          ? "PDF answer rule: answer the user's exact question from the PDF excerpts with a fuller structured answer. Use headings, key points, mechanisms, and exam relevance. If the excerpts are insufficient, say what is missing, then clearly label any general dental knowledge."
          : "PDF answer rule: answer the user's exact question from the PDF excerpts with a useful exam-focused answer. Give the direct answer, the key rationale, and 3–5 high-yield points. If the excerpts are insufficient, say what is visible and avoid inventing."
      : "";

    const baseUserPrompt = [
      `Subject: ${subject}`,
      `Study mode: ${isDeepStudy ? "Deep study" : mode}`,
      questionLine,
      `Instruction: ${modeExplanation}`,
      isDeepStudy
        ? "Target depth: detailed teaching with clinical reasoning and exam hooks."
        : "Target depth: concise exam-point answer with substance.",
      pdfAnswerRule,
      ragContext ? `\nRelevant PDF excerpts:\n${ragContext}` : "",
      isOverview
        ? "\nTask: PDF overview request. Synthesize the document-level picture from visible excerpts. Ignore earlier assistant claims if they conflict with the excerpts."
        : "\nKeep the answer exam-relevant, clinical, and direct.",
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

    const content = await generateGeminiTextWithDeepFallback({
      deepModel: GEMINI_DEEP_MODEL,
      liteModel: GEMINI_QUICK_MODEL,
      isDeep: isDeepStudy,
      messages: finalMessages,
      temperature: isDeepStudy ? 0.45 : 0.4,
      maxOutputTokens: isDeepStudy
        ? MAX_OUTPUT_TOKENS_DEEP
        : MAX_OUTPUT_TOKENS_QA,
      enableThinking: isDeepStudy,
    });

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
