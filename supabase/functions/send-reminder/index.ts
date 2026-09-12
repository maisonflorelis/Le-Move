import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const today = new Date().toISOString().split('T')[0];
  const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in3days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in1day = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let sent = 0;

  // ── 1. RAPPEL JOUR J ──
  const { data: profiles } = await supabase
    .from('Profiles')
    .select('id, prenom, date_emmenagement')
    .not('date_emmenagement', 'is', null);

  for (const profile of profiles || []) {
    const d = profile.date_emmenagement;
    let subject = null;
    let daysLeft = null;

    if (d === in7days) { daysLeft = 7; }
    else if (d === in3days) { daysLeft = 3; }
    else if (d === in1day) { daysLeft = 1; }

    if (!daysLeft) continue;

    // Get user email
    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
    if (!authUser?.user?.email) continue;
    const email = authUser.user.email;
    const prenom = profile.prenom || email.split('@')[0];

    // Check not already sent today
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', profile.id)
      .eq('type', 'jourj')
      .gte('created_at', today)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:40px 20px;background:#F7F3EE;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,31,20,0.08);">
    <div style="background:#2C1F14;padding:40px;text-align:center;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#F7F3EE;">Le Move</div>
      <div style="font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(247,243,238,0.5);margin-top:6px;">par Maison Florélis</div>
    </div>
    <div style="padding:40px;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#2C1F14;margin-bottom:16px;">
        ${daysLeft === 1 ? "Demain c'est le grand jour !" : `J-${daysLeft} avant ton déménagement !`} 🏠
      </div>
      <p style="font-size:14px;color:#6B5C4E;line-height:1.8;margin:0 0 24px;">
        Bonjour ${prenom} ! Dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}, c'est le grand jour. On a vérifié ta checklist pour toi — voici ce qui mérite ton attention.
      </p>
      <div style="background:#F7F3EE;border-radius:12px;padding:24px;margin-bottom:28px;">
        <div style="font-size:13px;color:#2C1F14;font-weight:500;margin-bottom:12px;">✅ Checklist J-${daysLeft}</div>
        ${daysLeft === 7 ? `
        <div style="font-size:12px;color:#6B5C4E;line-height:2;">
          📮 La Poste — réexpédition du courrier<br>
          🔌 Prévenir EDF/GDF pour le nouveau logement<br>
          📦 Commander les cartons si pas encore fait<br>
          🚚 Confirmer la réservation du camion<br>
          🔑 Vérifier l'heure de remise des clés
        </div>` : daysLeft === 3 ? `
        <div style="font-size:12px;color:#6B5C4E;line-height:2;">
          📦 Commencer à emballer les affaires non-essentielles<br>
          🏦 Confirmer le virement du dépôt de garantie<br>
          📱 Prévenir tes contacts du changement d'adresse<br>
          🛋 Vérifier les dates de livraison de tes meubles
        </div>` : `
        <div style="font-size:12px;color:#6B5C4E;line-height:2;">
          🔑 Vérifier que tu as toutes les clés<br>
          📱 Charger tous tes appareils<br>
          🎉 Profite — demain c'est ton nouveau chez-toi !
        </div>`}
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://lemove.fr/app.html" style="display:inline-block;background:#C17A4A;color:#fff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">
          Voir ma checklist →
        </a>
      </div>
    </div>
    <div style="background:#F7F3EE;padding:24px 40px;text-align:center;border-top:1px solid #EDE8E1;">
      <div style="font-size:10px;color:#9C8B7E;">© 2026 Maison Florélis · <a href="https://lemove.fr" style="color:#9C8B7E;">lemove.fr</a></div>
    </div>
  </div>
</body></html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Le Move <bonjour@lemove.fr>",
        to: email,
        subject: daysLeft === 1 ? "Demain c'est le grand jour ! 🏠" : `J-${daysLeft} avant ton déménagement — ta checklist`,
        html: emailHtml,
      }),
    });

    // Create in-app notification
    await supabase.from('notifications').insert({
      user_id: profile.id,
      type: 'jourj',
      titre: `Jour J dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} !`,
      message: `Ton déménagement approche. Vérifie ta checklist !`,
      lien: 'demenagement.html',
    });

    sent++;
  }

  // ── 2. ALERTES LIVRAISONS DU JOUR ──
  const { data: livraisons } = await supabase
    .from('achats_commandes')
    .select('user_id, nom')
    .eq('date_livraison', today)
    .neq('statut', 'livré');

  // Group by user
  const byUser: Record<string, string[]> = {};
  for (const l of livraisons || []) {
    if (!byUser[l.user_id]) byUser[l.user_id] = [];
    byUser[l.user_id].push(l.nom);
  }

  for (const [userId, items] of Object.entries(byUser)) {
    // Check not already notified today
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'livraison')
      .gte('created_at', today)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { data: profileData } = await supabase
      .from('Profiles')
      .select('prenom')
      .eq('id', userId)
      .single();

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    if (!authUser?.user?.email) continue;

    const prenom = profileData?.prenom || authUser.user.email.split('@')[0];

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:40px 20px;background:#F7F3EE;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:#2C1F14;padding:32px;text-align:center;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:24px;color:#F7F3EE;">Le Move</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:24px;margin-bottom:12px;">🚚</div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#2C1F14;margin-bottom:12px;">
        ${items.length} livraison${items.length > 1 ? 's' : ''} prévue${items.length > 1 ? 's' : ''} aujourd'hui !
      </div>
      <p style="font-size:13px;color:#6B5C4E;line-height:1.8;margin-bottom:20px;">
        Bonjour ${prenom} ! Voici ce qui devrait arriver aujourd'hui :
      </p>
      <div style="background:#F7F3EE;border-radius:10px;padding:16px;margin-bottom:24px;">
        ${items.map(i => `<div style="font-size:13px;color:#2C1F14;padding:6px 0;border-bottom:1px solid #EDE8E1;">📦 ${i}</div>`).join('')}
      </div>
      <a href="https://lemove.fr/achats.html" style="display:inline-block;background:#C17A4A;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">
        Voir mes commandes →
      </a>
    </div>
  </div>
</body></html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Le Move <bonjour@lemove.fr>",
        to: authUser.user.email,
        subject: `🚚 ${items.length} livraison${items.length > 1 ? 's' : ''} prévue${items.length > 1 ? 's' : ''} aujourd'hui`,
        html: emailHtml,
      }),
    });

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'livraison',
      titre: `${items.length} livraison${items.length > 1 ? 's' : ''} aujourd'hui`,
      message: items.join(', ') + ' devrai' + (items.length > 1 ? 'ent' : 't') + ' arriver aujourd\'hui.',
      lien: 'achats.html',
    });

    sent++;
  }

  return new Response(JSON.stringify({ success: true, sent }), { status: 200 });
});
