import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    const userData = await userRes.json();
    if (!userData?.id) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const userId = userData.id;

    // Check usage count
    const usageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/moodboard_usage?user_id=eq.${userId}&select=count`,
      { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY } }
    );
    const usageData = await usageRes.json();
    const usageCount = usageData?.[0]?.count || 0;

    if (usageCount >= 3) {
      return new Response(JSON.stringify({ error: "limit_reached", message: "Tu as atteint ta limite de 3 générations." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { answers, mode } = await req.json();

    // Build prompt
    const prompt = buildPrompt(answers, mode);

    // Call Claude API
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `Tu es un designer d'intérieur expert, consultant pour Le Move, une app d'emménagement premium française.
Tu génères des recommandations déco ultra-personnalisées, précises et actionnables.
Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans texte avant ou après.`,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      result = { error: "parse_error" };
    }

    // Increment usage
    await fetch(`${SUPABASE_URL}/rest/v1/moodboard_usage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ user_id: userId, count: usageCount + 1 }),
    });

    return new Response(JSON.stringify({ result, remaining: 2 - usageCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

function buildPrompt(answers, mode) {
  const base = `
Génère une recommandation déco personnalisée basée sur ces réponses :
${JSON.stringify(answers, null, 2)}

Réponds avec ce JSON exact :
{
  "style_principal": "Nom du style (ex: Japandi, Scandinave, Contemporain...)",
  "style_description": "2-3 phrases décrivant ce style appliqué à leur situation",
  "palette": [
    { "nom": "Couleur dominante", "hex": "#XXXXXX", "role": "Murs et grands meubles (60%)" },
    { "nom": "Couleur secondaire", "hex": "#XXXXXX", "role": "Canapé, rideaux, tapis (30%)" },
    { "nom": "Couleur accent", "hex": "#XXXXXX", "role": "Coussins, vases, luminaires (10%)" }
  ],
  "matieres": ["matière 1", "matière 2", "matière 3"],
  "pieces": {
    "salon": "Conseil déco spécifique pour le salon",
    "chambre": "Conseil déco spécifique pour la chambre",
    "cuisine": "Conseil déco spécifique pour la cuisine"
  },
  "boutiques": [
    { "nom": "Boutique", "pourquoi": "Raison adaptée à leur budget/style", "budget": "fourchette prix" },
    { "nom": "Boutique", "pourquoi": "Raison", "budget": "fourchette prix" },
    { "nom": "Boutique", "pourquoi": "Raison", "budget": "fourchette prix" }
  ],
  "achats_prioritaires": [
    { "item": "Article prioritaire 1", "pourquoi": "Impact maximal", "budget_estime": "XX–XX€" },
    { "item": "Article prioritaire 2", "pourquoi": "Impact maximal", "budget_estime": "XX–XX€" },
    { "item": "Article prioritaire 3", "pourquoi": "Impact maximal", "budget_estime": "XX–XX€" }
  ],
  "conseil_expert": "Un conseil déco personnalisé et actionnable de 2-3 phrases",
  "a_eviter": ["Erreur déco à éviter 1", "Erreur déco à éviter 2", "Erreur déco à éviter 3"]
}`;
  return base;
}
