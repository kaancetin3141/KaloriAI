#!/usr/bin/env bash
# KaloriAI — Active penetration test suite (pre-launch)
# Target: http://localhost:3000
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0; WARN=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
warn() { WARN=$((WARN+1)); echo "  ⚠️  $1"; }
hdr()  { echo; echo "━━━ $1 ━━━"; }

# ─────────────────────────────────────────────
hdr "T1 — Kimliksiz erişim taraması (tümü 401/404 beklenir)"
NOAUTH_PATHS=(
  "/api/diary" "/api/profile" "/api/targets" "/api/water" "/api/workouts"
  "/api/measurements" "/api/note" "/api/fasting" "/api/steps" "/api/reminders"
  "/api/recipes" "/api/planner" "/api/report" "/api/export" "/api/subscription"
  "/api/foods/custom" "/api/foods/favorites" "/api/foods/search?q=manti"
  "/api/foods/barcode?code=8690000001" "/api/progress/summary" "/api/note/stats"
  "/api/ai/insights" "/api/push" "/api/integrations/apple-health"
)
for p in "${NOAUTH_PATHS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$p")
  if [[ "$code" == "401" || "$code" == "404" ]]; then ok "GET $p → $code"; else bad "GET $p → $code (sızıntı?)"; fi
done
# AI POST uçları boş gövdeyle
for p in "/api/ai/analyze-photo" "/api/ai/coach" "/api/ai/parse-text" "/api/recipes/import" "/api/diary/copy"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE$p")
  if [[ "$code" == "401" || "$code" == "404" ]]; then ok "POST $p → $code"; else bad "POST $p → $code (sızıntı?)"; fi
done

# ─────────────────────────────────────────────
hdr "T2 — Kayıt doğrulama (zod güvenlik)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentest-x@t.dev","password":"1234567","name":"t","consent":true}' "$BASE/api/auth/register")
[[ "$r" == "400" ]] && ok "7-karakter şifre reddedildi → 400" || bad "zayıf şifre → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentest-x@t.dev","password":"parola1234","name":"t","consent":false}' "$BASE/api/auth/register")
[[ "$r" == "400" ]] && ok "onaysız kayıt reddedildi → 400" || bad "consentsiz → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"parola1234","name":"t","consent":true}' "$BASE/api/auth/register")
[[ "$r" == "400" || "$r" == "429" ]] && ok "geçersiz e-posta reddedildi → $r" || bad "kötü email → $r"

# ─────────────────────────────────────────────
hdr "T3 — Brute-force limitleme (5 yanlış deneme sonrası 429)"
RL_CODE=""
for i in 1 2 3 4 5 6 7; do
  RL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    -d '{"email":"elif@demo.kaloriai.app","password":"yanlis-parola-'$i'"}' "$BASE/api/auth/login")
done
if [[ "$RL_CODE" == "429" ]]; then ok "7. deneme → 429 RATE_LIMITED"; else bad "limitleme yok, son kod: $RL_CODE"; fi

# ─────────────────────────────────────────────
hdr "T4 — CSRF: cross-site Origin/Sec-Fetch bloğu"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -H "Origin: https://evil.attacker.example" -H "Sec-Fetch-Site: cross-site" \
  -d '{"email":"a@b.com","password":"x"}' "$BASE/api/auth/login")
[[ "$r" == "403" ]] && ok "cross-site Origin → 403" || bad "cross-site geçti → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{"demoId":"athlete"}' "$BASE/api/auth/demo")
[[ "$r" == "200" ]] && ok "same-origin Origin → 200 (meşru akış çalışıyor)" || bad "same-origin engellendi → $r"

# ─────────────────────────────────────────────
hdr "T5 — push/cron fail-closed (CRON_SECRET ayarlı değil)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/push/cron")
[[ "$r" == "401" ]] && ok "kimliksiz POST → 401" || bad "açık kaldı → $r"

# ─────────────────────────────────────────────
hdr "T6 — Meşru kullanıcı kurulumu (register + session)"
REG=$(curl -s -c /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentester@kaloriai.dev","password":"Pent3st!2026","name":"Pen Tester","consent":true}' \
  "$BASE/api/auth/register")
if echo "$REG" | grep -q "ok\":true"; then ok "kayıt + çerez alındı"; else warn "kayıt: $REG (muhtemelen zaten var — giriş denenir)"; fi
LOGIN=$(curl -s -c /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentester@kaloriai.dev","password":"Pent3st!2026"}' "$BASE/api/auth/login")
if echo "$LOGIN" | grep -q "ok\":true"; then ok "giriş başarılı"; else bad "giriş: $LOGIN"; fi
ME=$(curl -s -b /tmp/pt.jar "$BASE/api/auth/me")
echo "$ME" | grep -q "pentester" && ok "oturum çalışıyor (/api/auth/me)" || bad "/me: $ME"

# ─────────────────────────────────────────────
hdr "T7 — IDOR: başka kullanıcının özel dosyası"
# Diskte mevcut başka kullanıcıya ait gerçek dosya:
OTHER_DIR="cmuscz8gn000yohwjcbszne9l"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/files/ai/$OTHER_DIR/1791030473642.jpg")
[[ "$r" == "403" ]] && ok "başkasının /api/files/ai/<uid>/x → 403" || bad "IDOR! → $r"

# ─────────────────────────────────────────────
hdr "T8 — Path traversal (auth'lu + auth'suz)"
TV_1="/api/files/ai/pentest/..%2F..%2F..%2F..%2F.env"
TV_2="/api/files/ai/pentest/....//....//....//db/custom.db"
TV_3="/api/files/x/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
TV_4="/api/files/ai/pentest/%2e%2e%2f%2e%2e%2fsecret.jpg"
for tv in "$TV_1" "$TV_2" "$TV_3" "$TV_4"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE$tv")
  [[ "$code" == "404" || "$code" == "400" ]] && ok "$tv → $code" || bad "TRAVERSAL! $tv → $code"
done
# uzantı filtresi (jpg dışı)
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/files/ai/pentester/dummy.txt")
[[ "$code" == "404" ]] && ok "txt uzantısı reddedildi → 404" || bad "uzantı bypass → $code"

# ─────────────────────────────────────────────
hdr "T9 — SSRF: recipes/import iç ağ hedefleri"
for target in "http://localhost:3000/" "http://127.0.0.1:3000/api/auth/me" "http://169.254.169.254/latest/meta-data/" "file:///etc/passwd" "http://0.0.0.0:3000/"; do
  R=$(curl -s -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
    -d "{\"url\":\"$target\",\"locale\":\"tr\"}" "$BASE/api/recipes/import")
  if echo "$R" | grep -q "URL_BLOCKED\|VALIDATION"; then ok "engellendi: $target"; else bad "SSRF! $target → $(echo "$R" | head -c 120)"; fi
done

# ─────────────────────────────────────────────
hdr "T10 — SQL/NoSQL enjeksiyonu (Prisma parametrelendirilmiş — davranış doğrulama)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"'"'"' OR 1=1 --@x.com","password":"x"}' "$BASE/api/auth/login")
[[ "$r" == "401" || "$r" == "429" ]] && ok "SQLi payload → $r (çökme yok)" || bad "SQLi → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/foods/search?q=%27%20OR%201%3D1--")
[[ "$r" == "200" || "$r" == "429" ]] && ok "arama SQLi payload → $r (güvenli işlendi)" || bad "search SQLi → $r"

# ─────────────────────────────────────────────
hdr "T11 — Mass assignment (premium self-atama denemesi)"
r=$(curl -s -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"action":"subscribe","plan":"yearly","tier":"premium"}' "$BASE/api/subscription")
SUB=$(curl -s -b /tmp/pt.jar "$BASE/api/subscription")
echo "$SUB" | grep -q '"tier":"premium"' && warn "self-subscribe çalıştı (tasarım: RevenueCat simülasyonu — bilinen)" || ok "tiers dokunulmadı"
# profil alanına tier enjeksiyonu
curl -s -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"tier":"premium","isAdmin":true,"sex":"male","birthDate":"1995-01-01","heightCm":180,"weightKg":80,"goal":"maintain"}' \
  "$BASE/api/profile" > /dev/null
P=$(curl -s -b /tmp/pt.jar "$BASE/api/profile")
echo "$P" | grep -q '"isAdmin"' && bad "profil mass-assignment sızıntı!" || ok "profile mass-assignment: bilinmeyen alanlar yutuldu"

# ─────────────────────────────────────────────
hdr "T12 — Çerez güvenlik öznitelikleri"
COOKIE=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"demoId":"weightloss"}' "$BASE/api/auth/demo" | grep -i "set-cookie")
echo "$COOKIE" | grep -qi "httponly" && ok "HttpOnly var" || bad "HttpOnly YOK"
echo "$COOKIE" | grep -qi "samesite" && ok "SameSite var" || bad "SameSite YOK"

# ─────────────────────────────────────────────
hdr "T13 — Güvenlik başlıkları"
H=$(curl -s -D - -o /dev/null "$BASE/")
echo "$H" | grep -qi "x-content-type-options: nosniff" && ok "nosniff" || warn "nosniff eksik (sayfa)"
echo "$H" | grep -qi "referrer-policy" && ok "referrer-policy" || warn "referrer-policy eksik (sayfa)"
HA=$(curl -s -D - -o /dev/null -b /tmp/pt.jar "$BASE/api/auth/me")
echo "$HA" | grep -qi "x-content-type-options" && ok "nosniff (API)" || warn "nosniff eksik (API)"

# ─────────────────────────────────────────────
hdr "T14 — KVKK/GDPR: veri dışa aktarım + hesap silme"
E=$(curl -s -b /tmp/pt.jar "$BASE/api/export")
echo "$E" | grep -q "pentester" && ok "/api/export kendi verisini döndürüyor" || warn "export: $(echo "$E" | head -c 80)"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SONUÇ: ✅ $PASS geçti · ❌ $FAIL başarısız · ⚠️ $WARN uyarı"
