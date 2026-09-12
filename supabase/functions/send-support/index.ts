import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { prenom, email, subject, plan, message } = await req.json();

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#F7F3EE;font-family:Arial,sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:#FDFAF6;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,31,20,0.08);">
          <div style="background:#2C1F14;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#F7F3EE;">Le Move — Support</div>
            <div style="background:rgba(196,113,74,0.2);border:1px solid rgba(196,113,74,0.3);border-radius:20px;padding:4px 12px;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#C4714A;">${plan}</div>
          </div>
          <div style="padding:32px;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="padding:8px 0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#8A7968;width:100px;">De</td>
                <td style="padding:8px 0;font-size:13px;font-weight:300;color:#2C1F14;">${prenom}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#8A7968;">Email</td>
                <td style="padding:8px 0;font-size:13px;color:#C4714A;"><a href="mailto:${email}" style="color:#C4714A;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#8A7968;">Sujet</td>
                <td style="padding:8px 0;font-size:13px;font-weight:300;color:#2C1F14;">${subject}</td>
              </tr>
            </table>
            <div style="background:#F7F3EE;border-radius:10px;padding:20px;border-left:3px solid #C4714A;">
              <div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#8A7968;margin-bottom:10px;">Message</div>
              <div style="font-size:13px;font-weight:300;color:#2C1F14;line-height:1.8;white-space:pre-wrap;">${message}</div>
            </div>
            <div style="margin-top:24px;text-align:center;">
              <a href="mailto:${email}?subject=Re: ${subject} — Le Move Support"
                 style="display:inline-block;background:#C4714A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">
                Répondre à ${prenom} →
              </a>
            </div>
          </div>
          <div style="background:#F7F3EE;padding:16px 32px;text-align:center;border-top:1px solid #E8E0D5;">
            <p style="font-size:10px;color:#C9BAA8;margin:0;">Le Move Support · bonjour@lemove.fr</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send to support inbox
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Le Move Support <bonjour@lemove.fr>",
        to: ["bonjour@lemove.fr"],
        reply_to: email,
        subject: `[Support] ${subject} — ${prenom}`,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(JSON.stringify(data));

    // Send confirmation to user
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Le Move <bonjour@lemove.fr>",
        to: [email],
        subject: "On a bien reçu ton message — Le Move",
        html: `
          <div style="max-width:480px;margin:40px auto;background:#FDFAF6;border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;">
            <div style="background:#2C1F14;padding:28px 32px;text-align:center;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:24px;color:#F7F3EE;">Le Move</div>
            </div>
            <div style="padding:32px;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#2C1F14;margin-bottom:12px;">Message bien reçu, ${prenom} !</div>
              <p style="font-size:13px;color:#8A7968;line-height:1.7;margin-bottom:16px;">On a bien reçu ta demande concernant <strong style="color:#2C1F14">"${subject}"</strong> et on te répondra sous 24h.</p>
              <p style="font-size:12px;color:#C9BAA8;line-height:1.6;">En attendant, n'hésite pas à consulter notre FAQ directement dans le module Support de ton espace.</p>
            </div>
          </div>
        `,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
