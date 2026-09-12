import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Le Move <bonjour@lemove.fr>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, access, inviteUrl, ownerName } = await req.json();

    const accessLabel = access === "full" ? "accès complet (lecture + modification)" : "accès en lecture seule";

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#F7F3EE;font-family:Arial,sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:#FDFAF6;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,31,20,0.08);">
          <div style="background:#2C1F14;padding:36px 40px;text-align:center;">
            <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#F7F3EE;">Le Move</div>
            <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(247,243,238,0.4);margin-top:4px;">par Maison Florélis</div>
          </div>
          <div style="padding:40px;">
            <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#2C1F14;margin-bottom:12px;">Tu as été invité(e) !</div>
            <p style="font-size:13px;color:#8A7968;line-height:1.7;margin-bottom:8px;">
              <strong style="color:#2C1F14">${ownerName}</strong> t'invite à accéder à son espace Le Move avec un ${accessLabel}.
            </p>
            <p style="font-size:13px;color:#8A7968;line-height:1.7;margin-bottom:28px;">
              Clique sur le bouton ci-dessous pour accéder à l'espace partagé. Aucun compte n'est nécessaire.
            </p>
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${inviteUrl}" style="display:inline-block;background:#C4714A;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Accéder à l'espace →</a>
            </div>
            <div style="background:#F7F3EE;border-radius:8px;padding:16px;margin-bottom:16px;">
              <p style="font-size:10px;color:#8A7968;margin:0;line-height:1.6;">
                🔒 <strong>Accès sécurisé</strong> — Ce lien est personnel et unique. Ne le partage pas.
              </p>
            </div>
            <p style="font-size:11px;color:#C9BAA8;line-height:1.6;text-align:center;">Si tu ne connais pas ${ownerName} ou n'attendais pas cette invitation, ignore cet email.</p>
          </div>
          <div style="background:#F7F3EE;padding:20px 40px;text-align:center;border-top:1px solid #E8E0D5;">
            <p style="font-size:10px;color:#C9BAA8;margin:0;">© Le Move par Maison Florélis · <a href="https://lemove.fr" style="color:#C9BAA8;">lemove.fr</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `${ownerName} t'invite sur Le Move`,
        html,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
