// POST /api/gemini
// Keeps the Gemini API key on the server. The page sends { model, body } and gets Gemini's reply back.
// { ping: true }             -> free health check (is the key set?). Does not call Gemini.
// { ping: true, test: true } -> sends one tiny real request to Gemini and reports Google's answer,
//                               so you can see whether the key and model work. Never returns the key.

const MAX_BYTES = 120_000;          // a 10-minute call transcript fits comfortably
const MAX_OUTPUT_TOKENS = 4096;     // raised from 1024: newer models may spend part of this on thinking
const MODEL_OK = /^gemini-[a-z0-9.\-]+$/;
const MODEL_BLOCKED = /(pro|image|veo|tts|embedding|live)/; // only cheap/free text models
const TEST_MODEL = "gemini-flash-latest";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function originAllowed(origin, siteUrl) {
  if (!origin) return true; // same-origin requests from some browsers omit it
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (host === "localhost" || host === "127.0.0.1") return true;
  const allowed = [siteUrl, process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL,
    ...(process.env.ALLOWED_ORIGINS || "").split(",")]
    .map((u) => { try { return new URL(u.trim()).hostname; } catch { return ""; } })
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(host);
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!originAllowed(req.headers.get("origin"), context?.site?.url)) return json({ error: "origin_not_allowed" }, 403);

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ error: "too_large" }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }

  // Trim stray whitespace/quotes that often sneak in when pasting the key into Netlify.
  const key = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");

  if (data?.ping && !data?.test) return json({ ok: !!key }, key ? 200 : 503);
  if (!key) {
    console.error("GEMINI_API_KEY is not set. Add it in Site configuration > Environment variables, then redeploy.");
    return json({ error: "not_configured" }, 503);
  }

  // Diagnostic: one tiny real call so you can see Google's exact answer.
  if (data?.ping && data?.test) {
    try {
      const r = await fetch(endpoint(TEST_MODEL), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Say hi in one word." }] }], generationConfig: { maxOutputTokens: 256 } }),
      });
      const t = await r.text();
      let msg = "";
      try { const j = JSON.parse(t); msg = j?.error?.message || j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""; } catch {}
      console.log(`Test call ${TEST_MODEL}: HTTP ${r.status} ${msg.slice(0, 200)}`);
      return json({ ok: r.ok, model: TEST_MODEL, status: r.status, keyLength: key.length, message: msg.slice(0, 300) }, 200);
    } catch (e) {
      console.error("Test call could not reach Gemini:", e);
      return json({ ok: false, error: "upstream_unreachable" }, 502);
    }
  }

  const model = String(data?.model || "");
  if (!MODEL_OK.test(model) || MODEL_BLOCKED.test(model)) return json({ error: "model_not_allowed" }, 400);

  const b = data?.body || {};
  if (!Array.isArray(b.contents) || b.contents.length === 0 || b.contents.length > 120) return json({ error: "bad_contents" }, 400);
  const generationConfig = { ...(b.generationConfig || {}) };
  generationConfig.maxOutputTokens = Math.min(Number(generationConfig.maxOutputTokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);

  // Only include fields that are set, so Gemini never sees "undefined" keys.
  const payload = { contents: b.contents, generationConfig };
  if (b.systemInstruction) payload.systemInstruction = b.systemInstruction;

  let upstream;
  try {
    upstream = await fetch(endpoint(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Could not reach Gemini:", e);
    return json({ error: "upstream_unreachable" }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    let message = "";
    try { message = JSON.parse(text)?.error?.message || ""; } catch {}
    console.error(`Gemini ${model} ${upstream.status}: ${message || text.slice(0, 300)}`);
    // Pass the status and Google's message (never the key) so the page can fall back or retry.
    return json({ error: "upstream", status: upstream.status, message: message.slice(0, 300) }, upstream.status);
  }
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};

export const config = { path: "/api/gemini" };
