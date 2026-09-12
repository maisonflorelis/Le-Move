import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Le Move <bonjour@lemove.fr>";
const APP_URL = "https://lemove.fr/app.html";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const { user, email_data } = payload;

    const email = user?.email;
    const token = email_data?.token;
    const token_hash = email_data?.token_hash;
    const redirect_to = email_data?.redirect_to || APP_URL;
    const email_action_type = email_data?.email_action_type;

    let subject = "";
    let html = "";

    if (email_action_type === "recovery") {
      const resetUrl = `https://xnmlpxteslwmimmdqjye.supabase.co/auth/v1/verify?token=${token_hash}&type=recovery&redirect_to=${encodeURIComponent(redirect_to)}`;
      subject = "Réinitialisation de ton mot de passe — Le Move";
      html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#F7F3EE;font-family:'DM Sans',Arial,sans-serif;">
          <div style="max-width:560px;margin:40px auto;background:#FDFAF6;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,31,20,0.08);">
            <div style="background:#2C1F14;padding:36px 40px;text-align:center;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#F7F3EE;letter-spacing:0.02em;">Le Move</div>
              <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(247,243,238,0.4);margin-top:4px;">par Maison Florélis</div>
            </div>
            <div style="padding:40px;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#2C1F14;margin-bottom:12px;">Réinitialise ton mot de passe</div>
              <p style="font-size:13px;font-weight:300;color:#8A7968;line-height:1.7;margin-bottom:28px;">Tu as demandé à réinitialiser ton mot de passe Le Move. Clique sur le bouton ci-dessous pour en choisir un nouveau.</p>
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${resetUrl}" style="display:inline-block;background:#C4714A;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Réinitialiser mon mot de passe →</a>
              </div>
              <p style="font-size:11px;color:#C9BAA8;line-height:1.6;text-align:center;">Ce lien expire dans 24h. Si tu n'as pas demandé cette réinitialisation, ignore cet email.</p>
            </div>
            <div style="background:#F7F3EE;padding:20px 40px;text-align:center;border-top:1px solid #E8E0D5;">
              <p style="font-size:10px;color:#C9BAA8;margin:0;">© Le Move par Maison Florélis · <a href="https://lemove.fr" style="color:#C9BAA8;">lemove.fr</a></p>
            </div>
          </div>
        </body>
        </html>
      `;
    } else if (email_action_type === "signup" || email_action_type === "email_change") {
      const confirmUrl = `https://xnmlpxteslwmimmdqjye.supabase.co/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;
      subject = "Confirme ton adresse email — Le Move";
      html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#F7F3EE;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:40px auto;background:#FDFAF6;border-radius:16px;overflow:hidden;">
            <div style="background:#2C1F14;padding:36px 40px;text-align:center;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#F7F3EE;">Le Move</div>
              <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(247,243,238,0.4);margin-top:4px;">par Maison Florélis</div>
            </div>
            <div style="padding:40px;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#2C1F14;margin-bottom:12px;">Confirme ton adresse email</div>
              <p style="font-size:13px;color:#8A7968;line-height:1.7;margin-bottom:28px;">Bienvenue sur Le Move ! Clique ci-dessous pour confirmer ton adresse email et accéder à ton espace.</p>
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${confirmUrl}" style="display:inline-block;background:#C4714A;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Confirmer mon email →</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
    } else {
      // Magic link / OTP
      const magicUrl = `https://xnmlpxteslwmimmdqjye.supabase.co/auth/v1/verify?token=${token_hash}&type=magiclink&redirect_to=${encodeURIComponent(redirect_to)}`;
      subject = "Ton lien de connexion — Le Move";
      html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#F7F3EE;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:40px auto;background:#FDFAF6;border-radius:16px;overflow:hidden;">
            <div style="background:#2C1F14;padding:36px 40px;text-align:center;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#F7F3EE;">Le Move</div>
            </div>
            <div style="padding:40px;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#2C1F14;margin-bottom:12px;">Ton lien de connexion</div>
              <p style="font-size:13px;color:#8A7968;line-height:1.7;margin-bottom:28px;">Clique ci-dessous pour te connecter à ton espace Le Move.</p>
              <div style="text-align:center;">
                <a href="${magicUrl}" style="display:inline-block;background:#C4714A;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Me connecter →</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Send via Resend API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: data }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Hook error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
