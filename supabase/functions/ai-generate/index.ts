// supabase/functions/ai-generate/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FREE_DAILY_LIMIT = 8;
const PRO_DAILY_LIMIT = 200; // internal safety cap for paid users

function getTodayUTC(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable");
    return new Response(
      JSON.stringify({ error: "SERVER_MISCONFIGURED" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    // Read body safely and support BOTH old and new frontend shapes
const rawBody = (await req.json().catch(() => null)) as any;

// Old shape:  { prompt, studyMode, level, desiredOutputStyle }
// New shape:  { topic, mode, subject }
const topicRaw =
  rawBody?.topic ??
  rawBody?.prompt ??
  "";
const modeRaw =
  rawBody?.mode ??
  rawBody?.studyMode ??
  "General overview";
const subjectRaw =
  rawBody?.subject ??
  rawBody?.level ??
  "General dentistry";

const topic = topicRaw.toString().trim();
const mode = modeRaw.toString();
const subject = subjectRaw.toString();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "TOPIC_REQUIRED" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Supabase service client (can read/update user metadata)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Detect logged-in user from Authorization header (if present)
    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | null = null;

    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const jwt = authHeader.slice(7).trim();
      try {
        const { data, error } = await supabase.auth.getUser(jwt);
        if (!error && data?.user) {
          userId = data.user.id;
        }
      } catch (err) {
        console.error("Error getting user from JWT", err);
      }
    }

    // -----------------------------
    // Logged-in daily limit (server-side)
    // Anonymous visitors are limited only on frontend using localStorage
    // -----------------------------
    if (userId) {
      try {
        const today = getTodayUTC();

        const { data: adminData, error: adminError } =
          await supabase.auth.admin.getUserById(userId);

          if (adminError || !adminData?.user) {
            console.error("admin.getUserById error", adminError);
          } else {
            const userMeta: any = adminData.user.user_metadata || {};
            const appMeta: any = adminData.user.app_metadata || {};
  
            const subscriptionTier: string =
              (appMeta.subscription_tier as string) ||
              (userMeta.subscription_tier as string) ||
              "free";
  
            const isProTier =
              subscriptionTier === "pro" || subscriptionTier === "pro_yearly";
  
            const tierLimit = isProTier ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  
            let usedToday =
              typeof userMeta.ai_count === "number" ? userMeta.ai_count : 0;
            let storedDate =
              typeof userMeta.ai_date === "string" ? userMeta.ai_date : null;
  
            if (storedDate !== today) {
              usedToday = 0;
              storedDate = today;
            }
  
            if (usedToday >= tierLimit) {
              return new Response(
                JSON.stringify({
                  error: "LIMIT_REACHED",
                  type: "logged_in",
                  limit: tierLimit,
                  tier: subscriptionTier,
                }),
                {
                  status: 429,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }
  
            const newMeta = {
              ...userMeta,
              ai_date: today,
              ai_count: usedToday + 1,
            };
  
            const { error: updateError } =
              await supabase.auth.admin.updateUserById(userId, {
                user_metadata: newMeta,
              });
  
            if (updateError) {
              console.error("admin.updateUserById error", updateError);
            }
          }  
      } catch (err) {
        console.error("Error applying logged-in limit", err);
        // We don't block the request for meta errors
      }
    }

    // -----------------------------
    // Build AI prompt
    // -----------------------------
    const modeExplanation = (() => {
      const lower = mode.toLowerCase();
      if (lower.includes("osce")) {
        return "Produce an OSCE-style checklist or stepwise flow for stations, with headings, bullet points, and examiner-focused phrasing.";
      }
      if (lower.includes("flashcard")) {
        return "Produce front-and-back style flashcards with short, exam-focused prompts and answers.";
      }
      if (lower.includes("mcq")) {
        return "Produce board-style MCQs with options and correct answer explanation.";
      }
      if (lower.includes("notes") || lower.includes("summary")) {
        return "Produce high-yield structured notes with headings, subheadings, and bullet points.";
      }
      return "Produce a concise, high-yield explanation suitable for exam revision.";
    })();

    const systemPrompt =
      "You are DentAIstudy, an AI assistant that helps dental students and residents prepare for exams (OSCE, viva, written). " +
      "Always be structured, clinically sensible, and exam-focused. Do not give clinical treatment decisions for real patients. " +
      "Assume the user will always cross-check with textbooks and official guidelines.";

    const userPrompt = [
      `Subject: ${subject}`,
      `Study mode: ${mode}`,
      "",
      `Task: ${modeExplanation}`,
      "",
      `Topic / case: ${topic}`,
    ].join("\n");

    // -----------------------------
    // Call OpenAI Chat Completions
    // -----------------------------
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    const aiJson = await aiRes.json();

    if (!aiRes.ok) {
      console.error("OpenAI error", aiRes.status, aiJson);
      return new Response(
        JSON.stringify({ error: "AI_ERROR" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const content =
      aiJson?.choices?.[0]?.message?.content?.toString().trim() ??
      "";

    return new Response(
      JSON.stringify({ content }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("Unexpected error talking to OpenAI", err);
    return new Response(
      JSON.stringify({ error: "AI_NETWORK_ERROR" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
