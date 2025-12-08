// supabase/functions/delete-account/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[delete-account] missing Supabase env vars");
    return new Response(
      JSON.stringify({
        success: false,
        error: "Server is not configured for account deletion.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const authHeader =
      req.headers.get("Authorization") ||
      req.headers.get("authorization") ||
      "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing or invalid authorization header.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const jwt = authHeader.slice(7).trim();

    // Get the user from the JWT
    const { data: userData, error: userError } = await supabase.auth.getUser(
      jwt
    );

    if (userError || !userData?.user) {
      console.error("[delete-account] getUser error", userError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not verify your identity.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const user = userData.user;
    const userId = user.id;

    // Best-effort cleanup of avatar files in "profile-pictures" bucket
    try {
      const { data: files, error: listError } = await supabase.storage
        .from("profile-pictures")
        .list(userId, { limit: 100 });

      if (listError) {
        console.warn("[delete-account] storage list error", listError);
      } else if (files && files.length > 0) {
        const paths = files.map((file) => `${userId}/${file.name}`);
        const { error: removeError } = await supabase.storage
          .from("profile-pictures")
          .remove(paths);

        if (removeError) {
          console.warn("[delete-account] storage remove error", removeError);
        }
      }
    } catch (storageErr) {
      console.warn("[delete-account] storage cleanup error", storageErr);
    }

    // Delete the auth user (this also removes user_metadata / app_metadata)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      userId
    );

    if (deleteError) {
      console.error("[delete-account] admin.deleteUser error", deleteError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "We could not delete your account. Please try again.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("[delete-account] unexpected error", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Unexpected error while deleting account.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
