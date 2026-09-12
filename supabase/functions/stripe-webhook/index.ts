import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Disable JWT verification — security handled by Stripe signature
export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const OPENAI_ADS_ACCESS_TOKEN = Deno.env.get("OPENAI_ADS_ACCESS_TOKEN");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// OpenAI Ads Manager — pixel/data source for lemove.fr
const OPENAI_ADS_PIXEL_ID = "HMc6zVCHb4b2YzKwHT8j7E";

// Price ID → Plan
const PRICE_TO_PLAN: Record<string, string> = {
  "price_1TAf6xDG1Vnh6RV2whs6yTxr": "essentiel",
  "price_1TEdpGDG1Vnh6RV2gYoJDmKt": "complet",
  "price_1TEdngDG1Vnh6RV2xS7GexGE": "premium",
  "price_1TCRX6DG1Vnh6RV24enu1OK5": "partenaire",
  "price_1TIYkeDG1Vnh6RV2DugAsIF4": "partenaire",
};

// Payment link → Plan (fallback)
const LINK_TO_PLAN: Record<string, string> = {
  "3cIbJ1bPqfx56hD9kL6EU03": "essentiel",
  "14AcN5f1C70zeO940r6EU07": "complet",
  "7sYeVdf1C4Sr9tPdB16EU08": "premium",
  "dRm3cv8De1Gf21n8gH6EU09": "partenaire",
};

// Amount → Plan (fallback)
const AMOUNT_TO_PLAN: Record<number, string> = {
  3900: "essentiel",
  8900: "complet",
  15000: "premium",
  34900: "partenaire",
};

// Original amount (before discount) → Plan
const ORIGINAL_AMOUNT_TO_PLAN: Record<number, string> = {
  3900: "essentiel",
  8900: "complet",
  15000: "premium",
  34900: "partenaire",
};

const PLAN_DETAILS: Record<string, { label: string; price: string; color: string; features: string[] }> = {
  essentiel: {
    label: "Essentiel", price: "39€", color: "#C9BAA8",
    features: ["Mon Budget", "Mon Déménagement", "Guide des Aides", "Mes Achats & Livraisons"],
  },
  complet: {
    label: "Complet", price: "89€", color: "#B89A6A",
    features: ["Tout Essentiel +", "Calculateur Volume", "Checklist Administrative", "Carnet de Bord", "Mon Avancement", "Mes Contacts & Agenda", "Mon Moodboard", "Mes Médias"],
  },
  premium: {
    label: "Premium", price: "150€", color: "#C4714A",
    features: ["Tout Complet +", "Moodboard IA", "Espace Collaboratif", "Annuaire Pro vérifié", "Ma Crémaillère", "Support Prioritaire 24h"],
  },
  partenaire: {
    label: "Partenaire", price: "349€/an", color: "#7A8C7E",
    features: ["Dashboard partenaire", "Statistiques de visibilité", "Messages clients", "Fiche entreprise éditable"],
  },
};

// Verify Stripe signature manually (no SDK)
async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(",").reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts["t"];
    const sig = parts["v1"];
    if (!timestamp || !sig) return false;

    const payload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const computed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const computedHex = Array.from(new Uint8Array(computed))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return computedHex === sig;
  } catch {
    return false;
  }
}

async function stripeRequest(path: string, method = "GET", body?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json();
}

function getPlanFromSession(session: Record<string, unknown>): string | null {
  // Try payment link
  const paymentLink = session.payment_link as string;
  if (paymentLink) {
    for (const [key, plan] of Object.entries(LINK_TO_PLAN)) {
      if (paymentLink.includes(key)) return plan;
    }
  }
  // Try amount_total (normal payment)
  const amount = session.amount_total as number;
  if (amount && AMOUNT_TO_PLAN[amount]) return AMOUNT_TO_PLAN[amount];
  // Try amount_subtotal (before discount — handles 100% coupons where total = 0)
  const subtotal = session.amount_subtotal as number;
  if (subtotal && ORIGINAL_AMOUNT_TO_PLAN[subtotal]) return ORIGINAL_AMOUNT_TO_PLAN[subtotal];
  // Try metadata
  const metadata = session.metadata as Record<string, string>;
  if (metadata?.plan) return metadata.plan;
  // Last resort: try to get plan from line items description
  const lineItems = session.line_items as Record<string, unknown>;
  const firstItem = lineItems?.data?.[0] as Record<string, unknown>;
  const desc = (firstItem?.description as string || '').toLowerCase();
  if (desc.includes('essentiel')) return 'essentiel';
  if (desc.includes('complet')) return 'complet';
  if (desc.includes('premium')) return 'premium';
  return null;
}

// Reports a completed purchase to OpenAI Ads Manager (Conversions API).
// Non-blocking: any failure here must never interrupt the Stripe webhook handling.
async function sendOpenAiAdsConversion(sessionId: string, sourceUrl?: string) {
  if (!OPENAI_ADS_ACCESS_TOKEN) {
    console.warn("OPENAI_ADS_ACCESS_TOKEN not set — skipping OpenAI Ads conversion event");
    return;
  }
  try {
    const res = await fetch(`https://bzr.openai.com/v1/events?pid=${OPENAI_ADS_PIXEL_ID}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_ADS_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        validate_only: false,
        events: [
          {
            // Stripe checkout session id — stable per purchase, dedupes Stripe's webhook retries
            id: sessionId,
            type: "order_created",
            timestamp_ms: Date.now(),
            source_url: sourceUrl || "https://lemove.fr/",
            action_source: "web",
            data: { type: "contents" },
          },
        ],
      }),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) console.error("OpenAI Ads conversion error:", res.status, JSON.stringify(result));
    else console.log("✓ OpenAI Ads conversion sent:", JSON.stringify(result));
  } catch (err) {
    console.error("OpenAI Ads conversion request failed:", err);
  }
}

async function sendWelcomeEmail(email: string, plan: string, prenom?: string, tempPassword?: string | null) {
  const details = PLAN_DETAILS[plan] || PLAN_DETAILS.essentiel;
  const firstName = prenom || email.split("@")[0];
  const featuresList = details.features
    .map(f => `<li style="padding:4px 0;font-size:13px;color:#6B5C4E">✦ ${f}</li>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#2C1F14;padding:36px 40px;border-radius:16px 16px 0 0;text-align:center">
        <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#F7F3EE">Le Move</div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(247,243,238,0.35);margin-top:4px">par Maison Florélis</div>
      </div>
      <div style="background:#F7F3EE;padding:40px;border-radius:0 0 16px 16px">
        <h1 style="font-family:Georgia,serif;font-style:italic;font-weight:300;font-size:26px;color:#2C1F14;margin:0 0 8px">
          Bienvenue ${firstName} ✦
        </h1>
        <p style="color:#8A7968;font-size:13px;line-height:1.7;margin:0 0 24px">
          Ton accès <strong style="color:#2C1F14">Plan ${details.label}</strong> est maintenant actif.
          Ton espace Le Move est prêt — organise ton emménagement dès maintenant.
        </p>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #E8E0D5">
          <div style="margin-bottom:16px">
            <span style="font-family:Georgia,serif;font-size:32px;color:#2C1F14">${details.price}</span>
            <span style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:${details.color};margin-left:8px">Plan ${details.label} · Accès à vie</span>
          </div>
          <ul style="margin:0;padding:0;list-style:none">${featuresList}</ul>
        </div>
        ${tempPassword ? `
        <div style="background:#2C1F14;border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center">
          <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(247,243,238,0.4);margin-bottom:8px">Tes identifiants de connexion</div>
          <div style="font-size:13px;color:rgba(247,243,238,0.7);margin-bottom:6px">${email}</div>
          <div style="font-family:monospace;font-size:20px;color:#F7F3EE;letter-spacing:0.1em;margin-bottom:8px">${tempPassword}</div>
          <div style="font-size:10px;color:rgba(247,243,238,0.35)">Tu pourras changer ton mot de passe après ta première connexion</div>
        </div>` : ''}
        <div style="text-align:center;margin-bottom:24px">
          <a href="https://lemove.fr/app.html" style="display:inline-block;background:#2C1F14;color:#F7F3EE;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:11px;letter-spacing:0.12em;text-transform:uppercase">
            Accéder à mon espace →
          </a>
        </div>
        <p style="color:#C9BAA8;font-size:11px;text-align:center;margin:0">
          Une question ? Réponds directement à cet email.<br>
          <span style="color:#8A7968">L'équipe Le Move · lemove.fr</span>
        </p>
      </div>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Le Move <bonjour@lemove.fr>",
      to: email,
      subject: `✦ Ton accès Plan ${details.label} est activé — Le Move`,
      html,
    }),
  });

  const data = await res.json();
  console.log("Resend response:", JSON.stringify(data));
  return data;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

async function sendReviewEmailIfNeeded(email: string, plan: string, prenom?: string) {
  // Called from a cron or manually - not in this webhook
  // Placeholder for J+7 review email
}

async function updateUserPlan(email: string, plan: string) {
  console.log(`Updating plan: ${email} → ${plan}`);

  // Search user by email
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  let user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  // Always generate a temp password — set it on the account so client can connect
  const tempPassword = generatePassword();

  if (!user) {
    // Create new account
    console.log(`Creating new user: ${email}`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError) {
      console.warn(`Could not create user: ${createError.message}`);
      await sendWelcomeEmail(email, plan, undefined, tempPassword);
      return;
    }
    user = newUser.user;
    // Users table has bigint auto-increment id — don't insert id manually
    const { error: usersInsertError } = await supabase.from("Users").insert({
      Email: email,
      Plan: plan,
      created_at: new Date().toISOString(),
    });
    if (usersInsertError) console.error("Users insert error:", usersInsertError.message);
    else console.log("✓ Users row created");

    // Profiles table uses auth uuid as id
    const { error: profilesInsertError } = await supabase.from("Profiles").insert({
      id: user.id,
      created_at: new Date().toISOString(),
    });
    if (profilesInsertError) console.error("Profiles insert error:", profilesInsertError.message);
    else console.log("✓ Profiles row created");
    console.log(`✓ New user created: ${email}`);
  } else {
    // User exists — update their password so they can connect with the temp password
    const { error: pwdError } = await supabase.auth.admin.updateUserById(user.id, {
      password: tempPassword,
      email_confirm: true,
    });
    if (pwdError) console.warn(`Could not update password: ${pwdError.message}`);
    else console.log(`✓ Password reset for existing user: ${email}`);
  }

  // Update plan in Users table (linked by email)
  const { error: planUpdateError } = await supabase.from("Users")
    .update({ Plan: plan })
    .ilike("Email", email);
  if (planUpdateError) console.error("Plan update error:", planUpdateError.message);
  else console.log("✓ Plan updated in Users table");

  // Also update Profiles.Plan (linked by auth uuid — used by app for fast reads)
  const { error: profilePlanError } = await supabase.from("Profiles")
    .update({ Plan: plan })
    .eq("id", user.id);
  if (profilePlanError) console.error("Profiles plan update error:", profilePlanError.message);
  else console.log("✓ Plan updated in Profiles table");

  // Get prenom
  const { data: profile } = await supabase
    .from("Profiles").select("prenom").eq("id", user.id).single();

  // Si plan partenaire — créer/mettre à jour la ligne dans la table partenaires
  // en reprenant les infos déjà fournies lors de la candidature (annuaire pro)
  if (plan === "partenaire") {
    const { data: existingPartenaire } = await supabase
      .from("partenaires")
      .select("id")
      .eq("user_id", user.id)
      .single();

    // Récupère la candidature la plus récente correspondant à cet email
    const { data: candidature } = await supabase
      .from("candidatures_partenaires")
      .select("entreprise, activite, zone, telephone, siret, message, site, kbis_url, rc_pro_url, diplomes_url")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const partenaireData = {
      user_id: user.id,
      email: email,
      entreprise: candidature?.entreprise || (profile?.prenom ? `Entreprise de ${profile.prenom}` : "À compléter"),
      activite: candidature?.activite || "À compléter",
      zone: candidature?.zone || "À compléter",
      telephone: candidature?.telephone || null,
      site: candidature?.site || null,
      description: candidature?.message || null,
      kbis_url: candidature?.kbis_url || null,
      rc_pro_url: candidature?.rc_pro_url || null,
      diplomes_url: candidature?.diplomes_url || null,
      statut: "actif",
    };

    if (!existingPartenaire) {
      const { error: partenaireError } = await supabase.from("partenaires").insert({
        ...partenaireData,
        vues: 0,
        clics: 0,
        contacts: 0,
        profil_confirme: false,
      });
      if (partenaireError) {
        console.error("Partenaires insert error:", partenaireError.message);
      } else {
        console.log(candidature ? "✓ Ligne créée dans partenaires table (infos reprises de la candidature)" : "✓ Ligne créée dans partenaires table (aucune candidature trouvée — placeholders)");
      }
    } else {
      // Mettre à jour le statut + réappliquer les infos de candidature si disponibles
      await supabase.from("partenaires")
        .update(partenaireData)
        .eq("user_id", user.id);
      console.log("✓ Partenaire existant réactivé");
    }
  }

  // Send email
  await sendWelcomeEmail(email, plan, profile?.prenom);

  // In-app notification
  await supabase.from("notifications").insert({
    user_id: user.id,
    type: "module",
    titre: `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} activé ! 🎉`,
    message: `Ton accès ${plan} est actif. Découvre tes nouveaux modules.`,
    lien: "app.html",
    lue: false,
  });

  console.log(`✓ Done: ${email} → ${plan}`);
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  // Verify signature
  const valid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error("Invalid signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log(`Event: ${event.type}`);
  const data = event.data as Record<string, unknown>;
  const obj = data?.object as Record<string, unknown>;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const email = (obj.customer_details as Record<string, string>)?.email || obj.customer_email as string;
        if (!email) { console.warn("No email in session"); break; }

        // Expand session to get line items
        const expanded = await stripeRequest(`/checkout/sessions/${obj.id}?expand[]=line_items`);
        const priceId = expanded.line_items?.data?.[0]?.price?.id;

        let plan = priceId ? PRICE_TO_PLAN[priceId] : null;
        if (!plan) plan = getPlanFromSession(obj);
        if (!plan) { console.warn("Could not determine plan"); break; }

        await updateUserPlan(email, plan);
        await sendOpenAiAdsConversion(obj.id as string, obj.success_url as string | undefined);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const status = obj.status as string;
        const customerId = obj.customer as string;
        const customer = await stripeRequest(`/customers/${customerId}`);
        const email = customer.email;
        if (!email) break;

        const priceId = (obj.items as Record<string, unknown[]>)?.data?.[0]?.price?.id as string;
        const plan = priceId ? PRICE_TO_PLAN[priceId] : null;

        if (plan && (status === "active" || status === "trialing")) {
          await updateUserPlan(email, plan);
        } else if (status === "canceled" || status === "unpaid") {
          await updateUserPlan(email, "essentiel");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const customerId = obj.customer as string;
        const customer = await stripeRequest(`/customers/${customerId}`);
        if (customer.email) await updateUserPlan(customer.email, "essentiel");
        break;
      }
    }
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
