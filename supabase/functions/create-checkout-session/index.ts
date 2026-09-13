import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SITE_URL = "https://lemove.fr";

// Full price (cents) per plan — same amounts as the original Payment Links.
const PLAN_BASE_PRICE: Record<string, number> = {
  essentiel: 3900,
  complet: 8900,
  premium: 15000,
};

const PLAN_LABEL: Record<string, string> = {
  essentiel: "Essentiel",
  complet: "Complet",
  premium: "Premium",
};

const RENEWAL_DISCOUNT = 0.20;      // -20%
const REACTIVATION_DISCOUNT = 0.10; // -10%, plus faible que le renouvellement
const KEEP_MONTHLY_PRICE = 200;     // 2€/mois

type FlowType = "renewal" | "reactivation" | "keep_subscribe";

async function stripeRequest(path: string, body: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Stripe error ${res.status}`);
  return json;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const cors = {
    "Access-Control-Allow-Origin": "https://lemove.fr",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: cors });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: cors });
    }

    const { type } = await req.json() as { type: FlowType };
    if (!["renewal", "reactivation", "keep_subscribe"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400, headers: cors });
    }

    const { data: profile } = await supabase
      .from("Profiles")
      .select("Plan, plan_expires_at, keep_active")
      .eq("id", user.id)
      .single();

    const params = new URLSearchParams();
    params.set("success_url", `${SITE_URL}/app.html?renewed=1`);
    params.set("cancel_url", `${SITE_URL}/keep.html`);
    params.set("customer_email", user.email);
    params.set("metadata[type]", type);

    if (type === "keep_subscribe") {
      params.set("mode", "subscription");
      params.set("line_items[0][quantity]", "1");
      params.set("line_items[0][price_data][currency]", "eur");
      params.set("line_items[0][price_data][unit_amount]", String(KEEP_MONTHLY_PRICE));
      params.set("line_items[0][price_data][recurring][interval]", "month");
      params.set("line_items[0][price_data][product_data][name]", "Le Move Keep — accès consultable");
      params.set("subscription_data[metadata][type]", "keep_subscribe");
      params.set("cancel_url", `${SITE_URL}/keep.html`);
    } else {
      const plan = (profile?.Plan || "").toLowerCase();
      const basePrice = PLAN_BASE_PRICE[plan];
      if (!basePrice) {
        return new Response(JSON.stringify({ error: "No renewable plan on this account" }), { status: 400, headers: cors });
      }
      const discount = type === "renewal" ? RENEWAL_DISCOUNT : REACTIVATION_DISCOUNT;
      const amount = Math.round(basePrice * (1 - discount));

      params.set("mode", "payment");
      params.set("line_items[0][quantity]", "1");
      params.set("line_items[0][price_data][currency]", "eur");
      params.set("line_items[0][price_data][unit_amount]", String(amount));
      params.set(
        "line_items[0][price_data][product_data][name]",
        `Le Move — ${type === "renewal" ? "Renouvellement" : "Réactivation"} Plan ${PLAN_LABEL[plan] || plan} (6 mois)`
      );
      params.set("metadata[plan]", plan);
    }

    const session = await stripeRequest("/checkout/sessions", params);
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
