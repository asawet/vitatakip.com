// VitaTakip — takma ad hesabında "Şifremi unuttum" (kurtarma koduyla). Supabase Edge Function: sifre-kurtar
//
// Takma ad hesaplarının e-postası yoktur (arka planda <takmaad>@hesap.vitatakip.com.tr; bu adrese posta GİTMEZ).
// Kayıtta verilen kurtarma kodu (yalnız SHA-256 özeti public.recovery_codes'ta) ile yeni şifre belirlenir.
//
// Akış: { username, code, password } → deneme sınırı (takma ad başına 15 dk'da 5, IP başına saatte 20 hatalı deneme)
// → takma addan kullanıcı (profiles.username) → kod özeti sabit zamanlı karşılaştırılır → şifre yönetici API'siyle
// değiştirilir → kullanılan kod geçersiz olur, YENİ kod üretilip (özeti saklanır) bir kez kullanıcıya döndürülür.
// Hata yanıtları hangi parçanın yanlış olduğunu söylemez ("takma ad veya kod hatalı").
//
// Oturum gerekmez (kullanıcı şifresini unuttu): verify_jwt=false. Yönetici anahtarı yalnız sunucu ortamında.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const ALLOWED_ORIGINS = new Set([
  "https://vitatakip.com.tr",
  "https://www.vitatakip.com.tr",
  "http://localhost:8090", // yerel test (tests/manuel)
]);
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 karakter (0/O, 1/I yok) → 16 karakter = 80 bit
const HASH_PREFIX = "vitatakip-kurtarma:";
const MIN_PASSWORD = 8, MAX_PASSWORD = 72;
const USER_LIMIT = 5, USER_WINDOW_MIN = 15;
const IP_LIMIT = 20, IP_WINDOW_MIN = 60;

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://vitatakip.com.tr";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys && typeof keys.default === "string" && keys.default) return keys.default;
  } catch (_) { /* eski anahtar sistemine düş */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

export function normalizeCode(c: unknown): string {
  return String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameHex(a: string, b: string): boolean { // sabit zamanlı karşılaştırma
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join(""); // 256 % 32 = 0 → eşit dağılım
  return s.match(/.{4}/g)!.join("-");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return json({ error: "bad_request" }, 400, origin); }
  const username = String(body.username ?? "").trim().toLowerCase();
  const code = normalizeCode(body.code);
  const password = String(body.password ?? "");
  if (!USERNAME_RE.test(username) || code.length !== 16) return json({ error: "invalid" }, 400, origin);
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return json({ error: "weak_password" }, 400, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = secretKey();
  if (!url || !key) return json({ error: "server_misconfigured" }, 500, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);

  // Deneme sınırı (yalnız hatalı denemeler sayılır)
  const since = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const [u, i] = await Promise.all([
    admin.from("recovery_attempts").select("id", { count: "exact", head: true }).eq("username", username).eq("ok", false).gte("at", since(USER_WINDOW_MIN)),
    ip ? admin.from("recovery_attempts").select("id", { count: "exact", head: true }).eq("ip", ip).eq("ok", false).gte("at", since(IP_WINDOW_MIN)) : Promise.resolve({ count: 0, error: null }),
  ]);
  if (u.error || i.error) return json({ error: "server_error" }, 500, origin);
  if ((u.count ?? 0) >= USER_LIMIT || (i.count ?? 0) >= IP_LIMIT) return json({ error: "too_many_attempts", retry_after_min: USER_WINDOW_MIN }, 429, origin);
  const record = (ok: boolean) => admin.from("recovery_attempts").insert({ username, ip, ok });
  // Deneme kayıtları 1 günden fazla tutulmaz
  await admin.from("recovery_attempts").delete().lt("at", since(24 * 60));

  // Kullanıcı ve kod özeti
  const prof = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (prof.error) return json({ error: "server_error" }, 500, origin);
  const uid = prof.data?.id as string | undefined;
  let stored = "";
  if (uid) {
    const rc = await admin.from("recovery_codes").select("code_hash").eq("user_id", uid).maybeSingle();
    if (rc.error) return json({ error: "server_error" }, 500, origin);
    stored = (rc.data?.code_hash as string | undefined) ?? "";
  }
  const given = await sha256Hex(HASH_PREFIX + code);
  if (!uid || !stored || !sameHex(given, stored)) {
    await record(false);
    return json({ error: "invalid" }, 400, origin);
  }

  // Şifre değişir; kullanılan kod yenisiyle değişir (tek kullanımlık)
  const upd = await admin.auth.admin.updateUserById(uid, { password });
  if (upd.error) {
    const weak = /password/i.test(upd.error.message ?? "") || (upd.error as { code?: string }).code === "weak_password";
    return json({ error: weak ? "weak_password" : "server_error" }, weak ? 400 : 500, origin);
  }
  const fresh = newCode();
  const save = await admin.from("recovery_codes").upsert({ user_id: uid, code_hash: await sha256Hex(HASH_PREFIX + normalizeCode(fresh)), created_at: new Date().toISOString() });
  await record(true);
  // Yeni kod kaydedilemezse şifre yine değişmiştir; kullanıcı Ayarlar'dan yeni kod oluşturur.
  return json({ ok: true, code: save.error ? null : fresh }, 200, origin);
});
