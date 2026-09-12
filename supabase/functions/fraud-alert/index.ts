import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const config = { verify_jwt: false };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  const { user_id, type, details } = await req.json();
  if (!user_id || !type) return new Response("Missing params", { status: 400 });

  // Log alert
  await supabase.from("fraud_alerts").insert({ user_id, type, details });

  // For serious alerts, notify admin by email
  const seriousAlerts = ["multiple_countries", "country_change"];
  if (seriousAlerts.includes(type)) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const user = users.find(u => u.id === user_id);

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "Le Move Security <bonjour@lemove.fr>",
        to: "sheryl.mercier@gmail.com",
        subject: `🚨 Alerte sécurité Le Move — ${type}`,
        html: `<div style="font-family:Arial;padding:32px;max-width:560px">
          <h2 style="color:#C4714A">⚠️ Alerte sécurité détectée</h2>
          <p><strong>Type :</strong> ${type}</p>
          <p><strong>Utilisateur :</strong> ${user?.email || user_id}</p>
          <p><strong>Détails :</strong></p>
          <pre style="background:#F7F3EE;padding:16px;border-radius:8px;font-size:12px">${JSON.stringify(details, null, 2)}</pre>
          <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <a href="https://supabase.com/dashboard/project/xnmlpxteslwmimmdqjye/editor" style="background:#2C1F14;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:12px;display:inline-block;margin-top:16px">Voir dans Supabase →</a>
        </div>`,
      }),
    });
  }

  return new Response(JSON.stringify({ logged: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
