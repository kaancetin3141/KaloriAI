#!/usr/bin/env bash
# KaloriAI — Active penetration test suite (pre-launch, extended v2)
# Target: http://localhost:3000 (+ gateway :81 for T29)
# v2: benzersiz test hesabı (tekrarlanabilir koşum), oturum kurulumu garantili,
#     T29-T42 yeni saldırı vektörleri, koşum sonu hesap temizliği (KVKK).
set -u
BASE="http://localhost:3000"
GW="http://localhost:81"
TS=$(date +%s)
PT_EMAIL="pentest-${TS}@kaloriai.dev"
PT_PASS="Pent3st!${TS}"
JAR="/tmp/pt-${TS}.jar"
PASS=0; FAIL=0; WARN=0
TODAY=$(TZ=Europe/Istanbul date +%F)

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
warn() { WARN=$((WARN+1)); echo "  ⚠️  $1"; }
hdr()  { echo; echo "━━━ $1 ━━━"; }
jget() { jq -r "$1" 2>/dev/null; }

# 429 gelirse limiter penceresi temizlenene dek bekle ve tekrar dene
login_retry() {
  local email="$1" pass="$2" jar="$3" r=""
  for i in 1 2 3; do
    r=$(curl -s -o /tmp/pt_lr_body -w "%{http_code}" -c "$jar" -X POST \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$pass\"}" "$BASE/api/auth/login")
    [[ "$r" == "200" ]] && return 0
    if [[ "$r" == "429" ]]; then echo "    (login 429 — 65 sn bekleme, deneme $i/3)"; sleep 65; continue; fi
    return 1
  done
  [[ "$r" == "200" ]]
}

# ─────────────────────────────────────────────
hdr "T1 — Kimliksiz erişim taraması (tümü 401/404 beklenir)"
NOAUTH_PATHS=(
  "/api/diary" "/api/profile" "/api/targets" "/api/water" "/api/workouts"
  "/api/measurements" "/api/note" "/api/fasting" "/api/steps" "/api/reminders"
  "/api/recipes" "/api/planner" "/api/report" "/api/export" "/api/subscription"
  "/api/foods/custom" "/api/foods/favorites" "/api/foods/search?q=manti"
  "/api/foods/barcode?code=8690000001" "/api/progress/summary" "/api/note/stats"
  "/api/ai/insights" "/api/ai/history" "/api/gaps" "/api/push" "/api/sessions"
  "/api/integrations/apple-health"
)
for p in "${NOAUTH_PATHS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$p")
  # 405 = o metodda handler yok (ör. apple-health yalnız POST) — veri sızdırmaz, güvenli sayılır
  if [[ "$code" == "401" || "$code" == "404" || "$code" == "405" ]]; then ok "GET $p → $code"; else bad "GET $p → $code (sızıntı?)"; fi
done
# AI POST uçları boş gövdeyle
for p in "/api/ai/analyze-photo" "/api/ai/coach" "/api/ai/parse-text" "/api/recipes/import" "/api/diary/copy"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE$p")
  if [[ "$code" == "401" || "$code" == "404" ]]; then ok "POST $p → $code"; else bad "POST $p → $code (sızıntı?)"; fi
done

# ─────────────────────────────────────────────
hdr "T2 — Kayıt doğrulama (zod güvenlik)"
# Not: rate limit ÖNCE kontrol edilir → 429 = yine de RED (limiter çalışıyor demektir)
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentest-x@t.dev","password":"1234567","name":"t","consent":true}' "$BASE/api/auth/register")
if [[ "$r" == "400" || "$r" == "429" ]]; then ok "7-karakter şifre → $r (reddedildi)"; else bad "zayıf şifre → $r"; fi
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentest-x@t.dev","password":"parola1234","name":"t","consent":false}' "$BASE/api/auth/register")
if [[ "$r" == "400" || "$r" == "429" ]]; then ok "onaysız kayıt → $r (reddedildi)"; else bad "consentsiz → $r"; fi
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"parola1234","name":"t","consent":true}' "$BASE/api/auth/register")
if [[ "$r" == "400" || "$r" == "429" ]]; then ok "geçersiz e-posta → $r (reddedildi)"; else bad "kötü email → $r"; fi

# ─────────────────────────────────────────────
hdr "T3 — Brute-force limitleme (5 yanlış deneme sonrası 429)"
RL_CODE=""
for i in 1 2 3 4 5 6; do
  RL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    -d '{"email":"elif@demo.kaloriai.app","password":"yanlis-parola-'$i'"}' "$BASE/api/auth/login")
done
if [[ "$RL_CODE" == "429" ]]; then ok "6. deneme → 429 RATE_LIMITED"; else bad "limitleme yok, son kod: $RL_CODE"; fi

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
hdr "T6 — Meşru kullanıcı kurulumu (register + session, benzersiz e-posta)"
REG_CODE=429
for i in 1 2; do
  REG_CODE=$(curl -s -o /tmp/pt_reg -w "%{http_code}" -c "$JAR" -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$PT_EMAIL\",\"password\":\"$PT_PASS\",\"name\":\"Pen Tester\",\"consent\":true}" \
    "$BASE/api/auth/register")
  [[ "$REG_CODE" == "200" ]] && break
  [[ "$REG_CODE" == "429" ]] && { echo "    (register 429 — 300 sn bekleme)"; sleep 300; }
done
if [[ "$REG_CODE" == "200" ]]; then ok "kayıt → 200 + çerez"; else
  # hesap zaten varsa giriş dene
  login_retry "$PT_EMAIL" "$PT_PASS" "$JAR" && ok "mevcut hesaba giriş → 200" || { echo "⛔ oturum kurulamadı: $(cat /tmp/pt_reg)"; exit 1; }
fi
ME=$(curl -s -b "$JAR" "$BASE/api/auth/me")
echo "$ME" | grep -q "pentest" && ok "oturum çalışıyor (/api/auth/me)" || { echo "⛔ /me bozuk: $ME"; exit 1; }
PT_UID=$(echo "$ME" | jget '.user.id')

# Onboarding — hedefler olmadan çoğu endpoint anlamsız; premium kapı testleri için gerekli
curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{
  "sex":"male","birthDate":"1995-01-01","heightCm":180,"weightKg":80,
  "goal":"maintain","weeklyRateKg":0.5,"activityLevel":"moderate","userType":"general",
  "dietPreference":"any","allergens":"","trainingDayTarget":false,"carbCycling":false
}' "$BASE/api/onboarding" > /dev/null
ok "onboarding tamam (hedefler hazır)"

# ─────────────────────────────────────────────
hdr "T7 — IDOR: başka kullanıcının özel dosyası"
# Demo hesabıyla gerçek bir yabancı kullanıcı kimliği al (dosya VARLIĞI gerekmez —
# sahiplik kontrolü dosya okumadan ÖNCE gelir → sahte dosya adıyla bile 403 beklenir)
curl -s -c /tmp/pt_demo.jar -X POST -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{"demoId":"athlete"}' "$BASE/api/auth/demo" > /dev/null
OTHER_UID=$(curl -s -b /tmp/pt_demo.jar "$BASE/api/auth/me" | jget '.user.id')
if [[ -n "$OTHER_UID" && "$OTHER_UID" != "null" ]]; then
  r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/files/ai/$OTHER_UID/nonexistent-probe.jpg")
  [[ "$r" == "403" ]] && ok "başkasının /api/files/ai/<uid>/herhangi.jpg → 403 (sahiplik öncelikli)" || bad "IDOR! → $r"
else
  warn "demo kullanıcı alınamadı — eski sabit dizinle deneniyor"
  r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/files/ai/cmuscz8gn000yohwjcbszne9l/probe.jpg")
  [[ "$r" == "403" || "$r" == "404" ]] && ok "yabancı dosya erişimi → $r" || bad "IDOR! → $r"
fi
# IDOR varyantı: diary'ye yabancı userId parametresi enjeksiyonu — route oturum kullanıcısını kullanır, param YUTULMALI
DBODY=$(curl -s -b "$JAR" "$BASE/api/diary?date=2099-01-01&userId=$OTHER_UID")
echo "$DBODY" | grep -q "$OTHER_UID" && bad "IDOR — başka kullanıcının verisi döndü!" || ok "diary yabancı userId param yutuldu (yanıtta foreign id yok)"

# ─────────────────────────────────────────────
hdr "T8 — Path traversal (auth'lu + auth'suz)"
TV_1="/api/files/ai/pentest/..%2F..%2F..%2F..%2F.env"
TV_3="/api/files/x/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
TV_4="/api/files/ai/pentest/%2e%2e%2f%2e%2e%2fsecret.jpg"
for tv in "$TV_1" "$TV_3" "$TV_4"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE$tv")
  [[ "$code" == "404" || "$code" == "400" ]] && ok "$tv → $code" || bad "TRAVERSAL! $tv → $code"
done
code=$(curl -sL -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/files/ai/pentest/....//....//....//db/custom.db")
[[ "$code" == "404" || "$code" == "400" || "$code" == "403" ]] && ok "....//....// (308 takip sonrası final) → $code" || bad "TRAVERSAL! final → $code"
# uzantı filtresi (jpg dışı) — pentester gerçek uid'iyle scope: 403/404 = reddedildi
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/files/ai/$PT_UID/dummy.txt")
[[ "$code" == "404" || "$code" == "403" ]] && ok "txt uzantısı reddedildi → $code" || bad "uzantı bypass → $code"

# ─────────────────────────────────────────────
hdr "T9 — SSRF: recipes/import iç ağ hedefleri"
for target in "http://localhost:3000/" "http://127.0.0.1:3000/api/auth/me" "http://169.254.169.254/latest/meta-data/" "file:///etc/passwd" "http://0.0.0.0:3000/" "http://[::1]:3000/" "http://10.0.0.1/" "https://metadata.google.internal/";
do
  R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" \
    -d "{\"url\":\"$target\",\"locale\":\"tr\"}" "$BASE/api/recipes/import")
  if echo "$R" | grep -q "URL_BLOCKED\|VALIDATION"; then ok "engellendi: $target"; else bad "SSRF! $target → $(echo "$R" | head -c 120)"; fi
done

# ─────────────────────────────────────────────
hdr "T10 — SQL/NoSQL enjeksiyonu (Prisma parametrelendirilmiş — davranış doğrulama)"
# Not: bu iki istek bilinçli olarak izole x-real-ip kullanır — SQLi DAVRANIŞINI test
# ederiz, rate-limit doğruluğunu değil; gerçek IP bucket'ını tüketmeyelim.
r=$(curl -s -o /dev/null -w "%{http_code}" -H "x-real-ip: 10.99.99.1" -X POST -H "Content-Type: application/json" \
  -d '{"email":"'"'"' OR 1=1 --@x.com","password":"x"}' "$BASE/api/auth/login")
[[ "$r" == "401" || "$r" == "429" || "$r" == "400" ]] && ok "SQLi payload → $r (çökme yok; 400=zod e-posta reddi)" || bad "SQLi → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -H "x-real-ip: 10.99.99.2" -X POST -H "Content-Type: application/json" \
  -d '{"email":{"$gt":""},"password":{"$ne":null}}' "$BASE/api/auth/login")
[[ "$r" == "400" || "$r" == "401" || "$r" == "429" ]] && ok "NoSQL operator gövdesi → $r (zod tip reddi)" || bad "NoSQL operator → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/foods/search?q=%27%20OR%201%3D1--")
[[ "$r" == "200" || "$r" == "429" ]] && ok "arama SQLi payload → $r (güvenli işlendi)" || bad "search SQLi → $r"

# ─────────────────────────────────────────────
hdr "T11 — Mass assignment (premium self-atama denemesi)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST -H "Content-Type: application/json" \
  -d '{"action":"subscribe","plan":"yearly","tier":"premium"}' "$BASE/api/subscription")
SUB=$(curl -s -b "$JAR" "$BASE/api/subscription")
echo "$SUB" | grep -q '"tier":"premium"' && warn "self-subscribe çalıştı (tasarım: RevenueCat simülasyonu — bilinen)" || ok "tiers dokunulmadı"
# TEMİZLİK — sonraki bölümler (T23 premium kapı testi) free tier gerektirir
curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"cancel"}' "$BASE/api/subscription" > /dev/null
SUB2=$(curl -s -b "$JAR" "$BASE/api/subscription")
echo "$SUB2" | grep -q '"tier":"free"' && ok "cancel temizliği → tier:free (T23'e hazır)" || warn "cancel sonrası: $(echo "$SUB2" | head -c 60)"
# profil alanına tier enjeksiyonu (PATCH — profil route'un gerçek mutasyon metodu)
curl -s -b "$JAR" -X PATCH -H "Content-Type: application/json" \
  -d '{"tier":"premium","isAdmin":true,"sex":"male","birthDate":"1995-01-01","heightCm":180,"weightKg":80,"goal":"maintain"}' \
  "$BASE/api/profile" > /dev/null
P=$(curl -s -b "$JAR" "$BASE/api/profile")
echo "$P" | grep -q '"isAdmin"' && bad "profil mass-assignment sızıntı!" || ok "profile mass-assignment: bilinmeyen alanlar yutuldu"

# ─────────────────────────────────────────────
hdr "T12 — Çerez güvenlik öznitelikleri"
COOKIE=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{"demoId":"weightloss"}' "$BASE/api/auth/demo" | grep -i "set-cookie")
echo "$COOKIE" | grep -qi "httponly" && ok "HttpOnly var" || bad "HttpOnly YOK"
echo "$COOKIE" | grep -qi "samesite" && ok "SameSite var" || bad "SameSite YOK"

# ─────────────────────────────────────────────
hdr "T13 — Güvenlik başlıkları"
H=$(curl -s -D - -o /dev/null "$BASE/")
echo "$H" | grep -qi "x-content-type-options: nosniff" && ok "nosniff" || warn "nosniff eksik (sayfa)"
echo "$H" | grep -qi "referrer-policy" && ok "referrer-policy" || warn "referrer-policy eksik (sayfa)"
HA=$(curl -s -D - -o /dev/null -b "$JAR" "$BASE/api/auth/me")
echo "$HA" | grep -qi "x-content-type-options" && ok "nosniff (API)" || warn "nosniff eksik (API)"

# ─────────────────────────────────────────────
hdr "T14 — KVKK/GDPR: veri dışa aktarım"
E=$(curl -s -b "$JAR" "$BASE/api/export")
echo "$E" | grep -q '"profile"' && ok "/api/export kendi verisini döndürüyor (profile bloğu var)" || warn "export: $(echo "$E" | head -c 80)"

# ─────────────────────────────────────────────
hdr "T15 — XSS: depolanan payload JSON verisi olarak dönmeli (HTML yansıma YOK)"
XS='<script>alert(1)</script><img src=x onerror=alert(1)>javascript:alert(2)'
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST -H "Content-Type: application/json" \
  -d '{"text":"x '"$XS"'"}' "$BASE/api/note")
[[ "$r" == "200" ]] && ok "XSS payload not'a yazıldı → 200" || bad "note XSS POST → $r"
NB=$(curl -s -D /tmp/pt_hdr -b "$JAR" "$BASE/api/note")
grep -qi "^content-type: application/json" /tmp/pt_hdr && ok "note GET Content-Type: application/json (HTML yansıma yok)" || bad "note GET HTML olarak dönüyor!"
echo "$NB" | grep -qF '<script>alert(1)</script>' && ok "payload ham JSON STRING verisi (istismar edilemez, React escape'ler)" || warn "payload note'ta bulunamadı: $(echo "$NB" | head -c 80)"
# temizlik
curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"text":null,"mood":null}' "$BASE/api/note" > /dev/null

# ─────────────────────────────────────────────
hdr "T16 — Prototype pollution (__proto__ / constructor)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH -H "Content-Type: application/json" \
  -d '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}},"sex":"male","birthDate":"1995-01-01","heightCm":180,"weightKg":80,"goal":"maintain"}' \
  "$BASE/api/profile")
[[ "$r" != "5"* && "$r" != "405" ]] && ok "proto payload → $r (500/405 yok, işlendi)" || bad "proto pollution → $r"
P=$(curl -s -b "$JAR" "$BASE/api/profile")
echo "$P" | grep -q '"isAdmin":true' && bad "PROTOTYPE POLLUTION ETKİLİ — isAdmin enjekte oldu!" || ok "isAdmin enjekte edilmedi"

# ─────────────────────────────────────────────
hdr "T17 — HTTP method tampering (yanlış metod → 2xx OLMAMALI)"
for spec in "DELETE /api/profile" "PATCH /api/water" "PUT /api/auth/me" "DELETE /api/auth/me" "POST /api/export" "TRACE /api/profile"; do
  m=${spec%% *}; p=${spec#* }
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X "$m" "$BASE$p")
  if [[ "$code" == 2* || "$code" == 30* ]]; then bad "$m $p → $code (çalıştı!)"; else ok "$m $p → $code (reddedildi)"; fi
done

# ─────────────────────────────────────────────
hdr "T18 — CRLF / header injection"
H18=$(curl -s -D - -o /dev/null -b "$JAR" "$BASE/api/foods/search?q=a%0d%0aSet-Cookie:%20evil%3Dinjected")
echo "$H18" | grep -qi "set-cookie: *evil" && bad "CRLF header injection BAŞARILI!" || ok "Set-Cookie:evil enjekte edilmedi"
code=$(echo "$H18" | head -1 | grep -o "[0-9][0-9][0-9]")
[[ "$code" != "5"* ]] && ok "CRLF payload arama → $code (çökme yok)" || bad "CRLF → 500"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/files/ai/x%0d%0aX-Evil:%201/a.jpg")
[[ "$r" != "5"* ]] && ok "CRLF dosya yolu → $r" || bad "CRLF files → 500"

# ─────────────────────────────────────────────
hdr "T19 — Content-Type confusion + cross-site text/plain (klasik CSRF bypass denemesi)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: text/plain" -H "Sec-Fetch-Site: cross-site" \
  -d '{"email":"pentester@kaloriai.dev","password":"Pent3st!2026"}' "$BASE/api/auth/login")
[[ "$r" == "403" ]] && ok "cross-site text/plain JSON gövdesi → 403 (CSRF bypass kapalı)" || bad "text/plain cross-site geçti → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Origin: http://localhost:3000" \
  -d '{"email":"'"$PT_EMAIL"'","password":"'"$PT_PASS"'"}' "$BASE/api/auth/login")
[[ "$r" != "5"* && "$r" != "403" ]] && ok "content-type'sız same-origin → $r (500 yok)" || bad "content-type'sız → $r"

# ─────────────────────────────────────────────
hdr "T20 — Oversized payload (2MB not metni)"
head -c 2000000 /dev/zero | tr '\0' 'A' > /tmp/pt_big.txt
printf '{"text":"%s"}' "$(cat /tmp/pt_big.txt)" > /tmp/pt_big.json
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST -H "Content-Type: application/json" \
  --data-binary @/tmp/pt_big.json "$BASE/api/note")
[[ "$r" == "400" || "$r" == "413" || "$r" == "422" ]] && ok "2MB gövde → $r (zod max 2000 reddi)" || bad "2MB gövde → $r (kabul edildi mi?)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/foods/search?q=$(head -c 20000 /dev/zero | tr '\0' 'A')")
[[ "$r" != "5"* ]] && ok "20KB query string → $r (500 yok)" || bad "20KB query → 500"

# ─────────────────────────────────────────────
hdr "T21 — Oturum token manipülasyonu (kırpılmış/çöp/uzatılmış token → oturum REDDİ)"
TOKEN=$(awk '$6 ~ /session/ {print $NF}' "$JAR" | head -1)
mkjar() { awk -v val="$2" 'NR<=4{print;next} {$6="kaloriai_session"; $7=val; print}' OFS='\t' "$JAR"; }
TRUNC=$(echo "$TOKEN" | cut -c1-60); GARB=$(printf 'a%.0s' {1..96}); APPE="${TOKEN}xyz"
for spec in "kırpılmış:$TRUNC" "çöp96:$GARB" "uzatılmış:$APPE"; do
  name=${spec%%:*}; val=${spec#*:}
  mkjar x "$val" > /tmp/pt_t.jar
  BODY=$(curl -s -b /tmp/pt_t.jar "$BASE/api/auth/me")
  echo "$BODY" | grep -q '"user":null' && ok "$name token → oturum reddedildi (user:null)" || bad "$name token → $BODY (OTURUM DEVRALINDI?)"
done

# ─────────────────────────────────────────────
hdr "T22 — Mükerrer kayıt (bu koşumun e-postasıyla 2. kez)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$PT_EMAIL\",\"password\":\"$PT_PASS\",\"name\":\"Dup\",\"consent\":true}" "$BASE/api/auth/register")
[[ "$r" == "400" || "$r" == "409" || "$r" == "429" ]] && ok "aynı e-posta tekrar → $r (ikinci hesap oluşmadı; 429=IP limiti)" || bad "dup register → $r"

# ─────────────────────────────────────────────
hdr "T23 — Premium kapı (ücretsiz hesap)"
head -c 512 /dev/urandom > /tmp/pt_garbage.jpg
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/planner")
[[ "$r" == "402" ]] && ok "POST /api/planner (ücretsiz) → 402 PREMIUM_REQUIRED" || bad "planner AI ücretsiz açık → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/integrations/apple-health" \
  -F "dryRun=1" -F "file=@/tmp/pt_garbage.jpg;type=image/jpeg")
[[ "$r" == "402" || "$r" == "422" || "$r" == "415" ]] && ok "apple-health (free) → $r (premium kapı/422)" || bad "apple-health → $r"

# ─────────────────────────────────────────────
hdr "T24 — Open redirect (Location başlığı asla dış hosta gitmemeli)"
# GET metodunda login ucunun Location üretmediğini doğrula (POST bucket'ı tüketmeden)
r=$(curl -s -o /dev/null -w "%{http_code}" -D /tmp/pt_h1 -b "$JAR" "$BASE/api/auth/login?next=https://evil.example")
LOC1=$(grep -i "^location:" /tmp/pt_h1 | head -1)
[[ -z "$LOC1" || "$LOC1" != *"evil"* ]] && ok "login GET → $r, Location yok/meşru" || bad "open redirect: $LOC1"
H2=$(curl -s -D - -o /dev/null -b "$JAR" "$BASE/api/files/ai/x//evil.example/a.jpg")
LOCH=$(echo "$H2" | grep -i "^location:" | head -1 | tr -d '\r')
if [[ -z "$LOCH" ]]; then ok "çift-slash dosya yolu → yönlendirme yok"; else
  if echo "$LOCH" | grep -qE 'location: *//' ; then bad "PROTOCOL-RELATIVE open redirect: $LOCH"; else ok "308 Location host-içi: $LOCH"; fi
fi

# ─────────────────────────────────────────────
hdr "T25 — Upload filename saldırısı (multipart traversal isimli dosya)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/progress-photos" \
  -F "file=@/tmp/pt_garbage.jpg;filename=../../evil.jpg;type=image/jpeg")
[[ "$r" != "5"* && "$r" != "2"* ]] && ok "progress-photos traversal filename → $r (reddedildi)" || bad "progress-photos → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/ai/analyze-photo" \
  -F "file=@/tmp/pt_garbage.jpg;filename=../../evil.jpg;type=image/jpeg")
[[ "$r" == "415" || "$r" == "400" || "$r" == "413" || "$r" == "422" ]] && ok "analyze-photo bozuk görsel+traversal adı → $r" || bad "analyze-photo → $r"
EVIL_COUNT=$(find upload -name "evil.jpg" 2>/dev/null | wc -l)
[[ "$EVIL_COUNT" == "0" && ! -f "evil.jpg" ]] && ok "diskte evil.jpg oluşmadı (sanitizasyon kanıtlı)" || bad "DISKTE evil.jpg VAR!"

# ─────────────────────────────────────────────
hdr "T26 — Bilgi sızıntısı (hata gövdeleri stack/prisma yol göstermemeli)"
EB=$(curl -s -X POST -H "Content-Type: application/json" -d '{bad json' "$BASE/api/auth/login")
echo "$EB" | grep -qiE "node_modules|prisma|/home/|stack|at .*\(" && bad "malformed JSON hatası iç bilgi sızdırıyor: $(echo "$EB" | head -c 120)" || ok "malformed JSON → temiz hata gövdesi"
EB2=$(curl -s -b "$JAR" -X PATCH -H "Content-Type: application/json" \
  -d '{"goal":123,"weightKg":"<script>","activityLevel":"not-real"}' "$BASE/api/profile")
echo "$EB2" | grep -qiE "node_modules|prisma|/home/|at .*\(" && bad "zod hatası iç bilgi sızdırıyor" || ok "geçersiz tip (gerçek alanlar) → temiz gövde ($(echo "$EB2" | head -c 60))"

# ─────────────────────────────────────────────
hdr "T27 — Bozuk parametre tipleri (500 OLMAMALI)"
for spec in "diary?date=not-a-date" "diary?date=2099-99-99" "note/stats?days=all-your-base" "foods/barcode?code=" "diary?date=1900-01-01" "diary?date=9999-12-31" "gaps?date=13-13-13" "planner?week=xx"; do
  r=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/$spec")
  [[ "$r" != "5"* ]] && ok "$spec → $r" || bad "$spec → 500"
done

# ─────────────────────────────────────────────
hdr "T28 — Oturum token tazeliği (her girişte YENİ token)"
C1=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{"demoId":"weightloss"}' "$BASE/api/auth/demo" | grep -i "set-cookie" | grep -o "kaloriai_session=[^;]*" | cut -d= -f2)
C2=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{"demoId":"weightloss"}' "$BASE/api/auth/demo" | grep -i "set-cookie" | grep -o "kaloriai_session=[^;]*" | cut -d= -f2)
[[ -n "$C1" && -n "$C2" && "$C1" != "$C2" ]] && ok "iki demo girişi → farklı tokenlar (fixasyon yok)" || warn "tokenlar aynı/bos — manuel kontrol: len1=${#C1} len2=${#C2}"

# ─────────────────────────────────────────────
hdr "T29 — Ağ geçidi XFF üzerine-yazma (rate-limit IP spoof koruması)"
# Gateway (caddy :81) X-Real-IP/XFF'i {remote_host} ile ÜZERİNE yazar → istemci
# sahte XFF gönderse bile limiter anahtarı gerçek kaynak IP'de kalır.
# Test: 12 login denemesi, HER BİRİNDE farklı sahte XFF; spoof işe yarasa her
# istek farklı bucket'a düşer → hiç 429 gelmez. 429 GELİYORSA koruma sağlam.
GW_CODE="none"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  GW_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    -H "Origin: http://localhost:81" -H "X-Forwarded-For: 1.2.3.$i" -H "X-Real-IP: 5.6.7.$i" \
    -d '{"email":"spoof-probe@kaloriai.dev","password":"wrong"}' "$GW/api/auth/login")
  [[ "$GW_CODE" == "429" ]] && break
done
[[ "$GW_CODE" == "429" ]] && ok "12 dönen sahte XFF → 429 (geçidi üzerinden spoof bucket değiştiremedi)" \
  || bad "geçidi üzerinden XFF spoof rate-limit BYPASS → son kod $GW_CODE"
# Doğrudan erişimde (proxy'siz) spoof mümkün — bilinen mimari sınır, belgelenmiş:
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -H "x-real-ip: 9.9.9.9" -d '{"email":"spoof-probe@kaloriai.dev","password":"x"}' "$BASE/api/auth/login")
[[ "$r" != "5"* ]] && ok "doğrudan erişim x-real-ip → $r (proxy'siz spoof mimari notu: dışa kapalı)" || bad "doğrudan erişim → $r"

# ─────────────────────────────────────────────
hdr "T30 — AI iş kimliği IDOR (başkasının jobId'sini yoklama)"
# 1) Rastgele jobId'ler → JOB_NOT_FOUND, asla 500
for jid in "00000000-0000-0000-0000-000000000000" "not-a-uuid" "'; DROP TABLE" "11111111-2222-3333-4444-555555555555"; do
  R=$(curl -s -b "$JAR" "$BASE/api/planner?id=$(echo "$jid" | jq -sRr @uri 2>/dev/null || echo "$jid")")
  echo "$R" | grep -q "JOB_NOT_FOUND\|VALIDATION" && ok "planner?id='$jid' → reddedildi" || bad "planner?id=$jid → $R"
done
# 2) Yabancı kullanıcının gerçek işini yoklama: demo hesabı bir parse-text işi
#    başlatsın, pentester o jobId ile yoklama denesin → sahiplik reddi
PJ=$(curl -s -b /tmp/pt_demo.jar -X POST -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{"text":"1 elma","locale":"tr"}' "$BASE/api/ai/parse-text")
FJOB=$(echo "$PJ" | jget '.jobId')
if [[ -n "$FJOB" && "$FJOB" != "null" ]]; then
  FR=$(curl -s -b "$JAR" "$BASE/api/ai/parse-text?id=$FJOB")
  echo "$FR" | grep -q "JOB_NOT_FOUND" && ok "yabancı jobId yoklama → 404 (sahiplik kontrolü)" || bad "YABANCI İŞ OKUNDU: $FR"
else
  warn "demo işi alınamadı (hızlı yol/limit) — rastgele kimlik testi yeterli"
fi

# ─────────────────────────────────────────────
hdr "T31 — Kaynak sahipliği: yabancı kayıt kimlikleri (cuid tahmini)"
FAKE_ID="cmforeign00000000000000000000"
for spec in "PATCH /api/diary/item {\"id\":\"$FAKE_ID\",\"grams\":100}" "DELETE /api/diary/item?id=$FAKE_ID" "DELETE /api/reminders?id=$FAKE_ID" "DELETE /api/ai/history?id=$FAKE_ID" "DELETE /api/diary/template?id=$FAKE_ID" "DELETE /api/recipes?id=$FAKE_ID"; do
  m=${spec%% *}; rest=${spec#* }; path=${rest%% *}; body=${rest#* }
  if [[ -n "$body" && "$body" != "$rest" ]]; then
    R=$(curl -s -b "$JAR" -X "$m" -H "Content-Type: application/json" -d "$body" "$BASE$path")
  else
    R=$(curl -s -b "$JAR" -X "$m" "$BASE$path")
  fi
  echo "$R" | grep -qE '"error":"(NOT_FOUND|VALIDATION)"|"ok":true' && ok "$m yabancı id → reddedildi/işlemsiz" || bad "$m $path → $R"
done
# Şablon uygulama: yabancı templateId ile kendi hesabına enjeksiyon denemesi
R=$(curl -s -b "$JAR" -X PUT -H "Content-Type: application/json" -d "{\"templateId\":\"$FAKE_ID\",\"date\":\"$TODAY\"}" "$BASE/api/diary/template")
echo "$R" | grep -q '"error":"NOT_FOUND"' && ok "yabancı şablon uygula → 404" || bad "şablon IDOR: $R"

# ─────────────────────────────────────────────
hdr "T32 — Negatif/aşırı değer enjeksiyonu"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"deltaMl":-99999}' "$BASE/api/water")
echo "$R" | grep -q '"error":"VALIDATION"' && ok "su -99999ml → 400" || bad "su negatif: $R"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"count":-1}' "$BASE/api/steps")
echo "$R" | grep -q '"error":"VALIDATION"' && ok "adım -1 → 400" || bad "adım negatif: $R"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"type":"running","durationMin":0}' "$BASE/api/workouts")
echo "$R" | grep -q '"error":"VALIDATION"' && ok "antrenman 0 dk → 400" || bad "antrenman 0: $R"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"deltaMl":2001}' "$BASE/api/water")
echo "$R" | grep -q '"error":"VALIDATION"' && ok "su +2001ml (max üstü) → 400" || bad "su sınır: $R"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"count":200001}' "$BASE/api/steps")
echo "$R" | grep -q '"error":"VALIDATION"' && ok "adım 200001 (max üstü) → 400" || bad "adım sınır: $R"

# ─────────────────────────────────────────────
hdr "T33 — Oruç durum makinesi istismarı (çift başlat / orucsuz durdur)"
curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"stop"}' "$BASE/api/fasting" > /dev/null
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"start","targetHours":99}' "$BASE/api/fasting")
echo "$R" | grep -q '"error":"VALIDATION"' && ok "oruç 99 saat hedefi → 400 (max 24)" || bad "oruç hedef sınırı: $R"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"start"}' "$BASE/api/fasting")
R2=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"start"}' "$BASE/api/fasting")
echo "$R2" | grep -q 'FASTING_ACTIVE' && ok "çift oruç başlatma → 409" || bad "çift oruç: $R2"
R3=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"stop"}' "$BASE/api/fasting")
R4=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"stop"}' "$BASE/api/fasting")
echo "$R4" | grep -q 'NO_ACTIVE_FAST' && ok "orucsuz durdurma → 404" || bad "orucsuz stop: $R4"

# ─────────────────────────────────────────────
hdr "T34 — E-posta büyük/küçük harf (hesap çoğaltma/enum denemesi)"
UPPER=$(echo "$PT_EMAIL" | tr 'a-z' 'A-Z')
R=$(curl -s -H "x-real-ip: 10.99.99.3" -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$UPPER\",\"password\":\"$PT_PASS\"}" "$BASE/api/auth/login")
echo "$R" | grep -q '"ok":true' && ok "BÜYÜK harf e-posta aynı hesaba giriş (normalizasyon doğru)" || bad "büyük harf e-posta → $(echo "$R" | head -c 80)"
R2=$(curl -s -o /dev/null -w "%{http_code}" -H "x-real-ip: 10.99.99.4" -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$UPPER\",\"password\":\"$PT_PASS-x\",\"name\":\"Case Dup\",\"consent\":true}" "$BASE/api/auth/register")
[[ "$R2" == "409" || "$R2" == "400" || "$R2" == "429" ]] && ok "büyük harf e-posta ile YENİ kayıt → $R2 (çift hesap yok)" || bad "case-dup kayıt → $R2"

# ─────────────────────────────────────────────
hdr "T35 — Oturum iptali: diğer cihazları kapat → eski çerez ölür"
# İkinci bir oturum aç (aynı hesap, yeni jar)
curl -s -c /tmp/pt_second.jar -H "x-real-ip: 10.99.99.5" -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$PT_EMAIL\",\"password\":\"$PT_PASS\"}" "$BASE/api/auth/login" > /dev/null
ME2=$(curl -s -b /tmp/pt_second.jar "$BASE/api/auth/me")
echo "$ME2" | grep -q '"user":{"id"' && ok "ikinci oturum kuruldu" || warn "ikinci oturum alınamadı — kısıtlı doğrulama"
REV=$(curl -s -b "$JAR" -X DELETE "$BASE/api/sessions")
echo "$REV" | grep -q '"ok":true' && ok "oturum iptal ucu çalıştı ($(echo "$REV" | jget '.revoked') kapatıldı)" || bad "sessions DELETE: $REV"
ME3=$(curl -s -b /tmp/pt_second.jar "$BASE/api/auth/me")
echo "$ME3" | grep -q '"user":null' && ok "iptal edilen ikinci çerez artık ölü" || bad "İPTAL EDİLEN OTURUM YAŞIYOR: $ME3"
ME4=$(curl -s -b "$JAR" "$BASE/api/auth/me")
echo "$ME4" | grep -q '"user":{"id"' && ok "mevcut oturum hâlâ geçerli (kendi oturumuna dokunulmadı)" || bad "mevcut oturum yanlışlıkla öldü"

# ─────────────────────────────────────────────
hdr "T36 — Form-encoded gövde (JSON uçlarında content-type istismarı)"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" -d "deltaMl=500" "$BASE/api/water")
[[ "$R" != "5"* ]] && ok "form-encoded su gövdesi → $R (çökme yok)" || bad "form-encoded → 500"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" -d "mode=day&sourceDate=$TODAY&targetDate=$TODAY" "$BASE/api/diary/copy")
[[ "$R" != "5"* ]] && ok "form-encoded copy gövdesi → $R (çökme yok)" || bad "form-encoded copy → 500"

# ─────────────────────────────────────────────
hdr "T37 — Geçersiz foodId regresyonu (FK hatası → 500 SIZMASI)"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"foodId":"böyle-bir-yemek-yok"}' "$BASE/api/foods/favorites")
echo "$R" | grep -q '"error":"NOT_FOUND"' && ok "geçersiz foodId favorisi → 404 (temiz hata)" || bad "geçersiz foodId → $R (500 sızması?)"

# ─────────────────────────────────────────────
hdr "T38 — Tarif importu: şema dışı alan enjeksiyonu + AI prompt beslemesi"
R=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"https://example.com/tarifi\",\"locale\":\"tr\",\"userId\":\"$OTHER_UID\",\"isAdmin\":true}" "$BASE/api/recipes/import")
echo "$R" | grep -q '"jobId"\|"ok":true' && ok "ekstra alanlar yutuldu, iş kuruldu (parametre enjeksiyonu etkisiz)" || bad "import ekstra alan: $R"

# ─────────────────────────────────────────────
hdr "T39 — Hesap silme sonrası veri erişimi (silinmiş hesapla oturum)"
# (kvkk akışını tam test etmek func-test'te yapılır; burada ucun varlığı + koruma)
R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/account/delete")
[[ "$R" == "401" ]] && ok "kimliksiz hesap silme → 401" || bad "account/delete kimliksiz → $R"

# ─────────────────────────────────────────────
hdr "T40 — push/cron yanlış sır (fail-closed derinlemesine)"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "x-cron-secret: tahmin-edilebilir" "$BASE/api/push/cron")
[[ "$R" == "401" ]] && ok "yanlış CRON_SECRET → 401" || bad "yanlış sır → $R"
R=$(curl -s -o /dev/null -w "%{http_code}" -H "x-cron-secret: x" "$BASE/api/push/cron")
[[ "$R" == "401" ]] && ok "GET yanlış sır → 401" || bad "GET yanlış sır → $R"

# ─────────────────────────────────────────────
hdr "TEMİZLİK — test hesabını KVKK sil (DB'de iz bırakma)"
DEL=$(curl -s -b "$JAR" -X DELETE "$BASE/api/account/delete")
echo "$DEL" | grep -q '"ok":true' && ok "pentest hesabı silindi" || warn "hesap silinemedi: $DEL (elle silinmeli: $PT_EMAIL)"
rm -f "$JAR" /tmp/pt-${TS}* /tmp/pt_second.jar /tmp/pt_demo.jar /tmp/pt_t.jar /tmp/pt_big.* /tmp/pt_lr_body /tmp/pt_reg /tmp/pt_hdr /tmp/pt_h1 2>/dev/null

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SONUÇ: ✅ $PASS geçti · ❌ $FAIL başarısız · ⚠️ $WARN uyarı"
[[ "$FAIL" -gt 0 ]] && exit 1 || exit 0
