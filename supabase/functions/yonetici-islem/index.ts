// VitaTakip — Yönetici işlemi: kullanıcı hesabını silme. Supabase Edge Function: yonetici-islem
//
// Giriş kaydını (auth.users) silmek yönetici API'si ister; anahtar yalnız bu fonksiyonun ortamındadır.
// Akış: Authorization: Bearer <JWT> → belirteç Auth sunucusunda doğrulanır → çağıran profiles.is_admin olmalı →
// hedef: kendisi ya da başka bir yönetici OLAMAZ → istekte hedefin giriş bilgisi (e-posta / @takma ad) doğru yazılmış
// olmalı (yanlış hesabı silmeye karşı ikinci denetim) → işlem kaydı (admin_audit) yazılır → hesap silinir;
// profil, bulut verileri, bağlantılar, istekler, kurtarma kodu "on delete cascade" ile birlikte silinir.
// Doktorun yazdığı notlar hasta silinince anonimleşir (sahipsiz kalırsa tetikleyici siler).
// verify_jwt=false: doğrulama kodda (yeni anahtar sistemiyle uyum için; hesap-sil ile aynı).
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const ALLOWED_ORIGINS = new Set([
  "https://vitatakip.com.tr",
  "https://www.vitatakip.com.tr",
  "http://localhost:8090", // yerel test (tests/manuel)
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return json({ error: "bad_request" }, 400, origin); }
  if (body.action !== "delete_user") return json({ error: "bad_request" }, 400, origin);
  const target = String(body.user_id ?? "");
  const confirm = String(body.confirm ?? "").trim().toLowerCase();
  const note = String(body.note ?? "").trim().slice(0, 300);
  if (!UUID_RE.test(target)) return json({ error: "bad_request" }, 400, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = secretKey();
  if (!url || !key) return json({ error: "server_misconfigured" }, 500, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Çağıran: geçerli oturum + yönetici
  const { data: ud, error: ue } = await admin.auth.getUser(token);
  const me = ud?.user;
  if (ue || !me) return json({ error: "unauthorized" }, 401, origin);
  const mine = await admin.from("profiles").select("full_name, is_admin").eq("id", me.id).maybeSingle();
  if (mine.error) return json({ error: "server_error" }, 500, origin);
  if (!mine.data?.is_admin) return json({ error: "forbidden" }, 403, origin);
  if (target === me.id) return json({ error: "self" }, 400, origin);

  // Hedef
  const tp = await admin.from("profiles").select("full_name, username, account_type, is_admin, doctor_code").eq("id", target).maybeSingle();
  if (tp.error) return json({ error: "server_error" }, 500, origin);
  if (!tp.data) return json({ error: "not_found" }, 404, origin);
  if (tp.data.is_admin) return json({ error: "target_admin" }, 400, origin);
  const tu = await admin.auth.admin.getUserById(target);
  if (tu.error || !tu.data?.user) return json({ error: "not_found" }, 404, origin);
  const login = tp.data.username ? "@" + tp.data.username : String(tu.data.user.email ?? "");
  // İkinci denetim: yönetici hedefin giriş bilgisini yazmalı ("@" isteğe bağlı)
  if (confirm.replace(/^@/, "") !== login.toLowerCase().replace(/^@/, "")) return json({ error: "confirm_mismatch" }, 400, origin);

  const kind = tp.data.account_type === "doctor" ? "doktor" + (tp.data.doctor_code ? " " + tp.data.doctor_code : "") : "hasta";
  const label = (tp.data.full_name || "(adsız)") + " (" + login + ", " + kind + ")";
  const audit = await admin.from("admin_audit").insert({
    admin_id: me.id, admin_label: mine.data.full_name ?? "", action: "user_delete", target_id: target, target_label: label.slice(0, 300), note,
  }).select("id").single();
  if (audit.error) return json({ error: "server_error" }, 500, origin);

  const del = await admin.auth.admin.deleteUser(target);
  if (del.error) {
    await admin.from("admin_audit").delete().eq("id", audit.data.id); // silinmediyse kayıt da geri alınır
    return json({ error: "delete_failed" }, 500, origin);
  }
  return json({ ok: true, label }, 200, origin);
});
