// VitaTakip — "Hesabımı ve verilerimi sil" (bulut hesabı). Supabase Edge Function: hesap-sil
//
// Tarayıcıdaki herkese açık anahtar giriş kaydını (auth.users) silemez; bu yönetici yetkisi ister. Yönetici (secret)
// anahtarı Supabase'in bu fonksiyona OTOMATİK verdiği ortam değişkenindedir; hiçbir zaman tarayıcıya veya depoya girmez.
//
// Akış: istek, kullanıcının oturum belirteciyle (Authorization: Bearer <JWT>) gelir → belirteç Auth sunucusunda doğrulanır
// → YALNIZ o kullanıcı silinir (istekte başka kimlik kabul edilmez) → profiles ve user_stores satırları
// "on delete cascade" ile birlikte silinir (supabase/migrations/20261127180500_baslangic_semasi.sql).
//
// verify_jwt=false: platformun yerleşik JWT denetimi yeni anahtar sistemiyle uyumlu değil; doğrulama aşağıda kodda yapılır.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const ALLOWED_ORIGINS = new Set([
  "https://vitatakip.com.tr",
  "https://www.vitatakip.com.tr",
  "http://localhost:8090", // yerel test (tests/manuel)
]);

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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "unauthorized" }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = secretKey();
  if (!url || !key) return json({ error: "server_misconfigured" }, 500, origin);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Belirteç Auth sunucusunda doğrulanır; yalnız belirtecin sahibi silinebilir.
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return json({ error: "unauthorized" }, 401, origin);

  const del = await admin.auth.admin.deleteUser(user.id);
  if (del.error) {
    console.error("hesap-sil: silinemedi", user.id, del.error.message);
    return json({ error: "delete_failed" }, 500, origin);
  }
  console.log("hesap-sil: silindi", user.id);
  return json({ ok: true }, 200, origin);
});
