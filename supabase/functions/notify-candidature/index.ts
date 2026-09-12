import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = "bonjour@lemove.fr";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { record } = await req.json();
    if (!record) return new Response("No record", { status: 400 });

    const {
      prenom, nom, email, telephone, entreprise,
      siret, activite, zone, site, formule, message
    } = record;

    // Email à Sheryl
    const adminEmail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "Le Move <bonjour@lemove.fr>",
        to: [ADMIN_EMAIL],
        subject: `🤝 Nouvelle candidature partenaire — ${entreprise}`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FDFAF6">
  <div style="background:#2C1F14;padding:28px 36px;border-radius:12px 12px 0 0">
    <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#F7F3EE">Le Move</div>
    <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(247,243,238,0.4);margin-top:4px">Nouvelle candidature partenaire</div>
  </div>
  <div style="background:white;padding:32px 36px;border-radius:0 0 12px 12px;border:1px solid #E8E0D5">
    <h2 style="font-family:Georgia,serif;font-style:italic;font-weight:300;color:#2C1F14;margin:0 0 20px">
      ${prenom} ${nom} — ${entreprise}
    </h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968;width:140px">Email</td>
        <td style="padding:10px 0;color:#2C1F14"><a href="mailto:${email}" style="color:#C4714A">${email}</a></td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">Téléphone</td>
        <td style="padding:10px 0;color:#2C1F14">${telephone || "—"}</td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">Entreprise</td>
        <td style="padding:10px 0;color:#2C1F14">${entreprise}</td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">SIRET</td>
        <td style="padding:10px 0;color:#2C1F14">${siret || "—"}</td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">Activité</td>
        <td style="padding:10px 0;color:#2C1F14">${activite || "—"}</td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">Zone</td>
        <td style="padding:10px 0;color:#2C1F14">${zone || "—"}</td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">Site web</td>
        <td style="padding:10px 0;color:#2C1F14">${site ? `<a href="${site}" style="color:#C4714A">${site}</a>` : "—"}</td>
      </tr>
      <tr style="border-bottom:1px solid #E8E0D5">
        <td style="padding:10px 0;color:#8A7968">Formule</td>
        <td style="padding:10px 0;font-weight:600;color:#C4714A">${formule || "Partenaire"}</td>
      </tr>
      ${message ? `
      <tr>
        <td style="padding:10px 0;color:#8A7968;vertical-align:top">Message</td>
        <td style="padding:10px 0;color:#2C1F14;line-height:1.6">${message}</td>
      </tr>` : ""}
    </table>
    <div style="margin-top:24px;padding:16px;background:#F7F3EE;border-radius:10px;text-align:center">
      <a href="https://lemove.fr/admin-partenaires.html"
         style="display:inline-block;padding:12px 24px;background:#2C1F14;color:#F7F3EE;border-radius:8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none">
        Voir dans l'admin →
      </a>
    </div>
    <p style="color:#C9BAA8;font-size:11px;text-align:center;margin-top:20px">
      Le Move · lemove.fr
    </p>
  </div>
</div>`,
      }),
    });

    // Email de confirmation au candidat
    const confirmEmail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "Sheryl — Le Move <bonjour@lemove.fr>",
        to: [email],
        subject: `Votre candidature partenaire Le Move a bien été reçue`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FDFAF6">
  <div style="background:#2C1F14;padding:28px 36px;border-radius:12px 12px 0 0">
    <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#F7F3EE">Le Move</div>
    <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(247,243,238,0.4);margin-top:4px">Candidature partenaire</div>
  </div>
  <div style="background:white;padding:32px 36px;border-radius:0 0 12px 12px;border:1px solid #E8E0D5">
    <h2 style="font-family:Georgia,serif;font-style:italic;font-weight:300;color:#2C1F14;margin:0 0 16px">
      Bonjour ${prenom},
    </h2>
    <p style="font-size:14px;color:#2C1F14;line-height:1.8;margin:0 0 16px">
      Merci pour votre candidature partenaire Le Move. Nous avons bien reçu votre dossier concernant <strong>${entreprise}</strong>.
    </p>
    <p style="font-size:14px;color:#2C1F14;line-height:1.8;margin:0 0 16px">
      Nous examinons chaque candidature avec attention et reviendrons vers vous sous 48h pour la suite du processus.
    </p>
    <p style="font-size:14px;color:#2C1F14;line-height:1.8;margin:0 0 24px">
      En attendant, n'hésitez pas à visiter <a href="https://lemove.fr/partenaires.html" style="color:#C4714A">notre page partenaires</a> pour en savoir plus sur l'offre.
    </p>
    <div style="padding:16px;background:#F7F3EE;border-radius:10px;margin-bottom:24px">
      <p style="font-size:12px;color:#8A7968;margin:0;line-height:1.6">
        <strong style="color:#2C1F14">Récapitulatif :</strong><br>
        Entreprise : ${entreprise}<br>
        Formule : ${formule || "Partenaire 349€/an"}<br>
        Email de contact : ${email}
      </p>
    </div>
    <p style="font-size:13px;color:#8A7968;line-height:1.7;margin:0">
      À très bientôt,<br>
      <strong style="color:#2C1F14">Sheryl Mercier</strong><br>
      Fondatrice — Le Move<br>
      <a href="mailto:bonjour@lemove.fr" style="color:#C4714A">bonjour@lemove.fr</a> · <a href="https://lemove.fr" style="color:#C4714A">lemove.fr</a>
    </p>
    <p style="color:#C9BAA8;font-size:11px;text-align:center;margin-top:20px;font-style:italic">
      « L'art de bien s'installer. »
    </p>
  </div>
</div>`,
      }),
    });

    const adminOk = adminEmail.ok;
    const confirmOk = confirmEmail.ok;

    return new Response(
      JSON.stringify({ success: true, admin_email: adminOk, confirm_email: confirmOk }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
