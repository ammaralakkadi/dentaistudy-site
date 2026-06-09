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
const HISTORY_WINDOW = 10;
const MAX_MESSAGE_CHARS = 6000;
const MAX_OUTPUT_TOKENS_QA = 1600;
const MAX_OUTPUT_TOKENS_DEEP = 2600;

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
    throw new Error(`GEMINI_ERROR ${res.status}: ${raw.slice(0, 500)}`);
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => String(part?.text ?? ""))
    .join("")
    .trim();
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
    .map((item: any) => item?.values as number[])
    .filter(Boolean);
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
        batchRows[j].embedding = embeds[j];
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
          ...(messagesFromClient || []).map((m) => `${m.role}: ${m.content}`),
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
        temperature: 0.25,
        maxOutputTokens: 2600,
        responseMimeType: "application/json",
        messages: [
          {
            role: "system",
            content:
              "You are DentAIstudy, an expert dental tutor. Generate high-yield dental study flashcards. Output valid JSON only.",
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
          ...(messagesFromClient || []).map((m) => `${m.role}: ${m.content}`),
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
              "You are DentAIstudy, an expert dental tutor and exam writer. Generate dental exam-style MCQs. Output valid JSON only.",
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

    // Retrieve top-k relevant chunks unless we are building full PDF chapter notes
    const isDeepStudy = task === "chapter_notes";
    const canBuildPdfChapterNotes = Boolean(
      canUsePdf && isDeepStudy && activeFileId,
    );

    let ragContext = "";
    if (canUsePdf && !canBuildPdfChapterNotes) {
      try {
        const question =
          topic ||
          (messagesFromClient
            ?.slice()
            .reverse()
            .find((m) => m.role === "user")?.content ??
            "");

        if (question) {
          const [qEmbed] = await embedTexts([question]);
          const { data } = await supabaseUser.rpc("match_pdf_chunks", {
            p_conversation_id: conversationId,
            p_query_embedding: qEmbed,
            p_match_count: RETRIEVE_TOP_K,
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

        const sectionText = await generateGeminiText({
          model: GEMINI_DEEP_MODEL,
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS_QA,
          messages: [
            {
              role: "system",
              content:
                "You are DentAIstudy, an expert dental tutor. Create exam-ready notes from the provided text ONLY. " +
                "Keep the notes High Yield, structured, and accurate. Use short headings and bullets only when they help. " +
                "Do NOT invent missing content.",
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

      const merged = await generateGeminiText({
        model: GEMINI_DEEP_MODEL,
        temperature: 0.2,
        maxOutputTokens: MAX_OUTPUT_TOKENS_DEEP,
        messages: [
          {
            role: "system",
            content:
              "You are DentAIstudy, an expert dental tutor and clinical teaching professor. " +
              "Create one polished deep-study chapter sheet from the section notes. " +
              "Start with a short warm intro, then structure the answer with concise headings, core concepts, definitions, red flags, tables when useful, and likely exam questions. " +
              "No filler. No repeated points.",
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
        return "Give a fuller deep-study answer: direct answer, concept breakdown, mechanism or rationale, clinical relevance, exam traps, memory aids, and a short recap.";
      }

      const l = mode.toLowerCase();
      if (l.includes("osce")) {
        return "Produce an OSCE-style checklist or station flow with key examiner points.";
      }
      if (l.includes("flashcard")) {
        return "Produce concise but useful exam flashcards with answers.";
      }
      if (l.includes("mcq")) {
        return "Produce exam-style MCQs with answers and short explanations.";
      }

      return "Give a clear exam focused answer with the direct answer first, then fuller High Yield teaching points. Do not be too brief.";
    })();

    const systemPrompt =
      "You are DentAIstudy, an expert dental tutor and clinical teaching professor.\n" +
      "Your domain is dentistry, oral health, dental school learning, dental exams, and closely related medical topics used in dental training.\n" +
      "If the user asks about a clearly unrelated field, reply politely in 1–2 sentences that DentAIstudy is built for dental learning and invite a dental or oral-health question instead.\n" +
      "Start with a brief natural acknowledgement, then answer clearly and teach like a strong professor: accurate, structured, High Yield, and easy to revise.\n" +
      "When the request is in deep study mode, give a fuller layered explanation instead of a short reply.\n" +
      "Avoid filler, avoid repeating the same point twice, and do not invent facts.\n" +
      "If PDF excerpts are provided, use them as the primary source. If the excerpts do not contain the answer, say so clearly.";

    const baseUserPrompt = [
      `Subject: ${subject}`,
      `Study mode: ${isDeepStudy ? "Deep study" : mode}`,
      `Instruction: ${modeExplanation}`,
      isDeepStudy
        ? "Target depth: fuller teaching answer, not a short quick reply."
        : "Target depth: concise but still useful, not thin.",
      ragContext ? `\nRelevant PDF excerpts:\n${ragContext}` : "",
      "\nUse the chat context below. Keep it exam-relevant and student-friendly.",
    ].join("\n");

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
      { role: "system", content: systemPrompt },
      { role: "user", content: baseUserPrompt },
      ...safeHistory,
    ];

    const content = await generateGeminiText({
      model: isDeepStudy ? GEMINI_DEEP_MODEL : GEMINI_QUICK_MODEL,
      messages: finalMessages,
      temperature: isDeepStudy ? 0.35 : 0.3,
      maxOutputTokens: isDeepStudy
        ? MAX_OUTPUT_TOKENS_DEEP
        : MAX_OUTPUT_TOKENS_QA,
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
