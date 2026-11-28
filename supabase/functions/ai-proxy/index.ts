// VitaTakip — yapay zekâ proxy'si. Supabase Edge Function: ai-proxy
//
// Bulut hesabı olan ve kendi Gemini anahtarını girmemiş kullanıcının Vita AI isteklerini, VitaTakip'in Gemini anahtarıyla
// Google'a iletir. Anahtar YALNIZ burada: Supabase Edge Function Secret "GEMINI_API_KEY" (tarayıcıya/depoya girmez).
//
// Akış: oturum belirteci doğrulanır → günlük kota atomik düşülür (public.ai_quota_take; kullanıcı + uygulama geneli)
// → uygulamadaki gibi model sırası denenir (kota dolan/kaldırılan modelde sıradakine geçilir; her modelin ücretsiz
// kotası ayrıdır) → yanıt döner. Google yanıt veremezse düşülen hak geri verilir (ai_quota_refund).
// İstemci kota dolunca veya hata olunca uygulamadaki yerel motora düşer.
//
// Sınırlar (Secret ile değiştirilebilir, yeniden yükleme gerekmez): AI_DAILY_USER_LIMIT (10), AI_DAILY_GLOBAL_LIMIT (100),
// AI_MODELS (virgülle ayrılmış model sırası). Gönderilen içerik sınırlandırılır: yalnız contents / generationConfig /
// systemInstruction; araçlar (tools) kabul edilmez; istek en fazla ~6 MB; yanıt en fazla 4096 belirteç.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const ALLOWED_ORIGINS = new Set(["https://vitatakip.com.tr", "https://www.vitatakip.com.tr", "http://localhost:8090"]);
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const PER_MODEL_TIMEOUT_MS = 30000;

function cors(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://vitatakip.com.tr",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
function secretKey(): string {
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); if (typeof k.default === "string" && k.default) return k.default; } catch (_) { /* eski sistem */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
function intEnv(name: string, fb: number): number { const n = Number(Deno.env.get(name)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fb; }

/* Yalnız izinli alanlar Google'a gider. */
function sanitize(raw: any): { ok: true; body: any } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.contents) || raw.contents.length === 0 || raw.contents.length > 60) return { ok: false, error: "bad_contents" };
  const contents = raw.contents.map((c: any) => ({
    role: c && c.role === "model" ? "model" : "user",
    parts: Array.isArray(c && c.parts) ? c.parts.filter((p: any) => p && (typeof p.text === "string" || (p.inlineData && typeof p.inlineData.data === "string" && /^image\//.test(String(p.inlineData.mimeType || ""))))).map((p: any) => typeof p.text === "string" ? { text: p.text } : { inlineData: { mimeType: String(p.inlineData.mimeType), data: p.inlineData.data } }) : [],
  })).filter((c: any) => c.parts.length);
  if (!contents.length) return { ok: false, error: "bad_contents" };
  const g = raw.generationConfig && typeof raw.generationConfig === "object" ? raw.generationConfig : {};
  const generationConfig: Record<string, unknown> = {};
  for (const k of ["temperature", "topP", "topK", "candidateCount"]) if (typeof g[k] === "number") generationConfig[k] = g[k];
  generationConfig.maxOutputTokens = Math.min(typeof g.maxOutputTokens === "number" ? g.maxOutputTokens : 2048, 4096);
  if (typeof g.responseMimeType === "string") generationConfig.responseMimeType = g.responseMimeType;
  const body: Record<string, unknown> = { contents, generationConfig };
  const si = raw.systemInstruction;
  if (si && Array.isArray(si.parts)) body.systemInstruction = { parts: si.parts.filter((p: any) => p && typeof p.text === "string").map((p: any) => ({ text: p.text })) };
  return { ok: true, body };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "unauthorized" }, 401, origin);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return json({ error: "too_large" }, 413, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = secretKey();
  const gemini = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!url || !key) return json({ error: "server_misconfigured" }, 500, origin);
  if (!gemini) return json({ error: "ai_not_configured" }, 503, origin);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: ud, error: ue } = await admin.auth.getUser(token);
  const user = ud?.user;
  if (ue || !user) return json({ error: "unauthorized" }, 401, origin);

  let payload: any;
  try { const text = await req.text(); if (text.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413, origin); payload = JSON.parse(text); }
  catch (_) { return json({ error: "bad_json" }, 400, origin); }
  const clean = sanitize(payload && payload.body);
  if (!clean.ok) return json({ error: clean.error }, 400, origin);

  const userLimit = intEnv("AI_DAILY_USER_LIMIT", 10);
  const globalLimit = intEnv("AI_DAILY_GLOBAL_LIMIT", 100);
  const q = await admin.rpc("ai_quota_take", { p_user: user.id, p_user_limit: userLimit, p_global_limit: globalLimit });
  if (q.error) { console.error("ai-proxy: kota", q.error.message); return json({ error: "quota_error" }, 500, origin); }
  const quota = q.data as { ok: boolean; reason?: string; used: number; limit: number };
  if (!quota.ok) return json({ error: quota.reason === "global" ? "quota_global" : "quota_user", used: quota.used, limit: quota.limit }, 429, origin);

  const envModels = (Deno.env.get("AI_MODELS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const models = envModels.length ? envModels : DEFAULT_MODELS;
  let lastStatus = 0;
  for (const model of models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_MODEL_TIMEOUT_MS);
    try {
      const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": gemini }, body: JSON.stringify(clean.body), signal: ctrl.signal,
      });
      lastStatus = r.status;
      if (r.ok) {
        const data = await r.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts) ? parts.map((p: any) => p.text || "").join("").trim() : "";
        if (text) return json({ text, model, used: quota.used, limit: quota.limit }, 200, origin);
        continue; // boş yanıt: sıradaki model
      }
      // Anahtar geçersiz/izin yok: diğer modeller de başarısız olur, dur.
      if (r.status === 401 || r.status === 403) { console.error("ai-proxy: Gemini anahtarı reddedildi", r.status); break; }
      // 429 (kota), 404/400 (model yok/desteklenmiyor), 5xx: sıradaki model
    } catch (e) {
      lastStatus = 504; // zaman aşımı / ağ
    } finally { clearTimeout(timer); }
  }
  await admin.rpc("ai_quota_refund", { p_user: user.id });
  console.error("ai-proxy: hiçbir model yanıt vermedi", lastStatus);
  return json({ error: lastStatus === 429 ? "upstream_quota" : "upstream_failed", status: lastStatus }, 503, origin);
});
