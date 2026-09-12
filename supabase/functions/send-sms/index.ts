import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const config = { verify_jwt: false };

// Uses Twilio to send SMS
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM = Deno.env.get("TWILIO_PHONE_NUMBER")!;

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  const { phone, code, user_id } = await req.json();
  if (!phone || !code) return new Response("Missing params", { status: 400 });

  const message = `Le Move — Ton code de vérification : ${code}\nValable 10 minutes. Ne le partage jamais.`;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: TWILIO_FROM,
          To: phone,
          Body: message,
        }).toString(),
      }
    );

    const data = await res.json();
    console.log("SMS sent:", data.sid || data.message);

    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("SMS error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
