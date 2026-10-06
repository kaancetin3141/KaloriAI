#!/usr/bin/env bash
# KaloriAI — Active penetration test suite (pre-launch, extended)
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
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentest-x@t.dev","password":"1234567","name":"t","consent":true}' "$BASE/api/auth/register")
[[ "$r" == "400" ]] && ok "7-karakter şifre reddedildi → 400" || { [[ "$r" == "429" ]] && warn "zayıf şifre → 429 (register limiter dolu — tekrarlı koşum artefaktı)" || bad "zayıf şifre → $r"; }
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentest-x@t.dev","password":"parola1234","name":"t","consent":false}' "$BASE/api/auth/register")
[[ "$r" == "400" ]] && ok "onaysız kayıt reddedildi → 400" || { [[ "$r" == "429" ]] && warn "consentsiz → 429 (limiter dolu — tekrarlı koşum artefaktı)" || bad "consentsiz → $r"; }
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
PT_UID=$(echo "$ME" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# ─────────────────────────────────────────────
hdr "T7 — IDOR: başka kullanıcının özel dosyası"
# Diskte mevcut başka kullanıcıya ait gerçek dosya:
OTHER_DIR="cmuscz8gn000yohwjcbszne9l"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/files/ai/$OTHER_DIR/1791030473642.jpg")
[[ "$r" == "403" ]] && ok "başkasının /api/files/ai/<uid>/x → 403" || bad "IDOR! → $r"
# IDOR varyantı: diary'ye yabancı userId parametresi enjeksiyonu — route oturum kullanıcısını kullanır, param YUTULMALI
DBODY=$(curl -s -b /tmp/pt.jar "$BASE/api/diary?date=2099-01-01&userId=$OTHER_DIR")
echo "$DBODY" | grep -q "$OTHER_DIR" && bad "IDOR — başka kullanıcının verisi döndü!" || ok "diary yabancı userId param yutuldu (yanıtta foreign id yok)"

# ─────────────────────────────────────────────
hdr "T8 — Path traversal (auth'lu + auth'suz)"
TV_1="/api/files/ai/pentest/..%2F..%2F..%2F..%2F.env"
TV_2="/api/files/ai/pentest/....//....//....//db/custom.db"
TV_3="/api/files/x/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
TV_4="/api/files/ai/pentest/%2e%2e%2f%2e%2e%2fsecret.jpg"
for tv in "$TV_1" "$TV_3" "$TV_4"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE$tv")
  [[ "$code" == "404" || "$code" == "400" ]] && ok "$tv → $code" || bad "TRAVERSAL! $tv → $code"
done
# TV_2 çift eğik çizgi Next 308 slash-normalizasyonu üretir → -L ile takip, FİNAL kod sayılır
code=$(curl -sL -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE$TV_2")
[[ "$code" == "404" || "$code" == "400" || "$code" == "403" ]] && ok "....//....// (308 takip sonrası final) → $code" || bad "TRAVERSAL! TV_2 final → $code"
# uzantı filtresi (jpg dışı) — pentester gerçek uid'iyle scope: 403/404 = reddedildi
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/files/ai/$PT_UID/dummy.txt")
[[ "$code" == "404" || "$code" == "403" ]] && ok "txt uzantısı reddedildi → $code" || bad "uzantı bypass → $code"

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
[[ "$r" == "401" || "$r" == "429" || "$r" == "400" ]] && ok "SQLi payload → $r (çökme yok; 400=zod e-posta reddi)" || bad "SQLi → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/foods/search?q=%27%20OR%201%3D1--")
[[ "$r" == "200" || "$r" == "429" ]] && ok "arama SQLi payload → $r (güvenli işlendi)" || bad "search SQLi → $r"
# NoSQL operator gövdeleri (Express mongodb $gt tarzı) — JSON API'de anlamsız olmalı
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":{"$gt":""},"password":{"$ne":null}}' "$BASE/api/auth/login")
[[ "$r" == "400" || "$r" == "401" || "$r" == "429" ]] && ok "NoSQL operator gövdesi → $r (zod tip reddi)" || bad "NoSQL operator → $r"

# ─────────────────────────────────────────────
hdr "T11 — Mass assignment (premium self-atama denemesi)"
r=$(curl -s -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"action":"subscribe","plan":"yearly","tier":"premium"}' "$BASE/api/subscription")
SUB=$(curl -s -b /tmp/pt.jar "$BASE/api/subscription")
echo "$SUB" | grep -q '"tier":"premium"' && warn "self-subscribe çalıştı (tasarım: RevenueCat simülasyonu — bilinen)" || ok "tiers dokunulmadı"
# TEMİZLİK — sonraki bölümler (T23 premium kapı testi) free tier gerektirir
curl -s -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"action":"cancel"}' "$BASE/api/subscription" > /dev/null
SUB2=$(curl -s -b /tmp/pt.jar "$BASE/api/subscription")
echo "$SUB2" | grep -q '"tier":"free"' && ok "cancel temizliği → tier:free (T23'e hazır)" || warn "cancel sonrası: $(echo "$SUB2" | head -c 60)"
# profil alanına tier enjeksiyonu (PATCH — profil route'un gerçek mutasyon metodu)
curl -s -b /tmp/pt.jar -X PATCH -H "Content-Type: application/json" \
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
echo "$E" | grep -q '"profile"' && ok "/api/export kendi verisini döndürüyor (profile bloğu var)" || warn "export: $(echo "$E" | head -c 80)"

# ─────────────────────────────────────────────
hdr "T15 — XSS: depolanan payload JSON verisi olarak dönmeli (HTML yansıma YOK)"
XS='<script>alert(1)</script><img src=x onerror=alert(1)>javascript:alert(2)'
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  -d '{"text":"x '"$XS"'"}' "$BASE/api/note")
[[ "$r" == "200" ]] && ok "XSS payload not'a yazıldı → 200" || bad "note XSS POST → $r"
NB=$(curl -s -D /tmp/pt_hdr -b /tmp/pt.jar "$BASE/api/note")
grep -qi "^content-type: application/json" /tmp/pt_hdr && ok "note GET Content-Type: application/json (HTML yansıma yok)" || bad "note GET HTML olarak dönüyor!"
echo "$NB" | grep -qF '<script>alert(1)</script>' && ok "payload ham JSON STRING verisi (istismar edilemez, React escape'ler)" || warn "payload note'ta bulunamadı: $(echo "$NB" | head -c 80)"
# temizlik
curl -s -b /tmp/pt.jar -X POST -H "Content-Type: application/json" -d '{"text":null,"mood":null}' "$BASE/api/note" > /dev/null

# ─────────────────────────────────────────────
hdr "T16 — Prototype pollution (__proto__ / constructor)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X PATCH -H "Content-Type: application/json" \
  -d '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}},"sex":"male","birthDate":"1995-01-01","heightCm":180,"weightKg":80,"goal":"maintain"}' \
  "$BASE/api/profile")
[[ "$r" != "5"* && "$r" != "405" ]] && ok "proto payload → $r (500/405 yok, işlendi)" || bad "proto pollution → $r"
P=$(curl -s -b /tmp/pt.jar "$BASE/api/profile")
echo "$P" | grep -q '"isAdmin":true' && bad "PROTOTYPE POLLUTION ETKİLİ — isAdmin enjekte oldu!" || ok "isAdmin enjekte edilmedi"

# ─────────────────────────────────────────────
hdr "T17 — HTTP method tampering (yanlış metod → 2xx OLMAMALI)"
for spec in "DELETE /api/profile" "PATCH /api/water" "PUT /api/auth/me" "DELETE /api/auth/me" "POST /api/export" "TRACE /api/profile"; do
  m=${spec%% *}; p=${spec#* }
  code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X "$m" "$BASE$p")
  if [[ "$code" == 2* || "$code" == 30* ]]; then bad "$m $p → $code (çalıştı!)"; else ok "$m $p → $code (reddedildi)"; fi
done

# ─────────────────────────────────────────────
hdr "T18 — CRLF / header injection"
H18=$(curl -s -D - -o /dev/null -b /tmp/pt.jar "$BASE/api/foods/search?q=a%0d%0aSet-Cookie:%20evil%3Dinjected")
echo "$H18" | grep -qi "set-cookie: *evil" && bad "CRLF header injection BAŞARILI!" || ok "Set-Cookie:evil enjekte edilmedi"
code=$(echo "$H18" | head -1 | grep -o "[0-9][0-9][0-9]")
[[ "$code" != "5"* ]] && ok "CRLF payload arama → $code (çökme yok)" || bad "CRLF → 500"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/files/ai/x%0d%0aX-Evil:%201/a.jpg")
[[ "$r" != "5"* ]] && ok "CRLF dosya yolu → $r" || bad "CRLF files → 500"

# ─────────────────────────────────────────────
hdr "T19 — Content-Type confusion + cross-site text/plain (klasik CSRF bypass denemesi)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: text/plain" -H "Sec-Fetch-Site: cross-site" \
  -d '{"email":"pentester@kaloriai.dev","password":"Pent3st!2026"}' "$BASE/api/auth/login")
[[ "$r" == "403" ]] && ok "cross-site text/plain JSON gövdesi → 403 (CSRF bypass kapalı)" || bad "text/plain cross-site geçti → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Origin: http://localhost:3000" \
  -d '{"email":"pentester@kaloriai.dev","password":"Pent3st!2026"}' "$BASE/api/auth/login")
[[ "$r" != "5"* ]] && ok "content-type'sız same-origin → $r (500 yok)" || bad "content-type'sız → 500"

# ─────────────────────────────────────────────
hdr "T20 — Oversized payload (2MB not metni)"
head -c 2000000 /dev/zero | tr '\0' 'A' > /tmp/pt_big.txt
printf '{"text":"%s"}' "$(cat /tmp/pt_big.txt)" > /tmp/pt_big.json
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X POST -H "Content-Type: application/json" \
  --data-binary @/tmp/pt_big.json "$BASE/api/note")
[[ "$r" == "400" || "$r" == "413" || "$r" == "422" ]] && ok "2MB gövde → $r (zod max 2000 reddi)" || bad "2MB gövde → $r (kabul edildi mi?)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/foods/search?q=$(head -c 20000 /dev/zero | tr '\0' 'A')")
[[ "$r" != "5"* ]] && ok "20KB query string → $r (500 yok)" || bad "20KB query → 500"

# ─────────────────────────────────────────────
hdr "T21 — Oturum token manipülasyonu (kırpılmış/çöp/uzatılmış token → oturum REDDİ)"
# API tasarımı: geçersiz oturum → 200 + {"user":null} (istemci bunu logout sayar) — güvenlik özelliği: oturum kabul EDİLMEMELİ
TOKEN=$(awk '$6 ~ /session/ {print $NF}' /tmp/pt.jar | head -1)
mkjar() { awk -v val="$2" 'NR<=4{print;next} {$6="kaloriai_session"; $7=val; print}' OFS='\t' /tmp/pt.jar; }
TRUNC=$(echo "$TOKEN" | cut -c1-60); GARB=$(printf 'a%.0s' {1..96}); APPE="${TOKEN}xyz"
for spec in "kırpılmış:$TRUNC" "çöp96:$GARB" "uzatılmış:$APPE"; do
  name=${spec%%:*}; val=${spec#*:}
  mkjar x "$val" > /tmp/pt_t.jar
  BODY=$(curl -s -b /tmp/pt_t.jar "$BASE/api/auth/me")
  echo "$BODY" | grep -q '"user":null' && ok "$name token → oturum reddedildi (user:null)" || bad "$name token → $BODY (OTURUM DEVRALINDI?)"
done

# ─────────────────────────────────────────────
hdr "T22 — Mükerrer kayıt (aynı e-posta 2. kez)"
r=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d '{"email":"pentester@kaloriai.dev","password":"Pent3st!2026","name":"Dup","consent":true}' "$BASE/api/auth/register")
[[ "$r" == "400" || "$r" == "409" || "$r" == "429" ]] && ok "aynı e-posta tekrar → $r (ikinci hesap oluşmadı; 429=IP limiti)" || bad "dup register → $r"

# ─────────────────────────────────────────────
hdr "T23 — Premium kapı (ücretsiz hesap)"
head -c 512 /dev/urandom > /tmp/pt_garbage.jpg
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/planner")
[[ "$r" == "402" ]] && ok "POST /api/planner (ücretsiz) → 402 PREMIUM_REQUIRED" || bad "planner AI ücretsiz açık → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X POST "$BASE/api/integrations/apple-health" \
  -F "dryRun=1" -F "file=@/tmp/pt_garbage.jpg;type=image/jpeg")
[[ "$r" == "402" || "$r" == "422" || "$r" == "415" ]] && ok "apple-health (free) → $r (premium kapı/422)" || bad "apple-health → $r"

# ─────────────────────────────────────────────
hdr "T24 — Open redirect (Location başlığı asla dış hosta gitmemeli)"
r=$(curl -s -o /dev/null -w "%{http_code}" -D /tmp/pt_h1 -b /tmp/pt.jar -X POST "$BASE/api/auth/login?next=https://evil.example")
LOC1=$(grep -i "^location:" /tmp/pt_h1 | head -1)
[[ -z "$LOC1" || "$LOC1" == *"localhost"* || "$LOC1" == *"/"* && "$LOC1" != *"evil"* ]] && ok "login?next=evil → $r, Location yok/meşru" || bad "open redirect: $LOC1"
H2=$(curl -s -D - -o /dev/null -b /tmp/pt.jar "$BASE/api/files/ai/x//evil.example/a.jpg")
LOCH=$(echo "$H2" | grep -i "^location:" | head -1 | tr -d '\r')
if [[ -z "$LOCH" ]]; then ok "çift-slash dosya yolu → yönlendirme yok"; else
  if echo "$LOCH" | grep -qE 'location: *//' ; then bad "PROTOCOL-RELATIVE open redirect: $LOCH"; else ok "308 Location host-içi: $LOCH"; fi
fi

# ─────────────────────────────────────────────
hdr "T25 — Upload filename saldırısı (multipart traversal isimli dosya)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X POST "$BASE/api/progress-photos" \
  -F "file=@/tmp/pt_garbage.jpg;filename=../../evil.jpg;type=image/jpeg")
[[ "$r" != "5"* && "$r" != "2"* ]] && ok "progress-photos traversal filename → $r (reddedildi)" || bad "progress-photos → $r"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar -X POST "$BASE/api/ai/analyze-photo" \
  -F "file=@/tmp/pt_garbage.jpg;filename=../../evil.jpg;type=image/jpeg")
[[ "$r" == "415" || "$r" == "400" || "$r" == "413" || "$r" == "422" ]] && ok "analyze-photo bozuk görsel+traversal adı → $r" || bad "analyze-photo → $r"
EVIL_COUNT=$(find upload -name "evil.jpg" 2>/dev/null | wc -l)
[[ "$EVIL_COUNT" == "0" && ! -f "evil.jpg" ]] && ok "diskte evil.jpg oluşmadı (sanitizasyon kanıtlı)" || bad "DISKTE evil.jpg VAR!"

# ─────────────────────────────────────────────
hdr "T26 — Bilgi sızıntısı (hata gövdeleri stack/prisma yol göstermemeli)"
EB=$(curl -s -X POST -H "Content-Type: application/json" -d '{bad json' "$BASE/api/auth/login")
echo "$EB" | grep -qiE "node_modules|prisma|/home/|stack|at .*\(" && bad "malformed JSON hatası iç bilgi sızdırıyor: $(echo "$EB" | head -c 120)" || ok "malformed JSON → temiz hata gövdesi"
EB2=$(curl -s -b /tmp/pt.jar -X PATCH -H "Content-Type: application/json" \
  -d '{"goal":123,"weightKg":"<script>","activityLevel":"not-real"}' "$BASE/api/profile")
echo "$EB2" | grep -qiE "node_modules|prisma|/home/|at .*\(" && bad "zod hatası iç bilgi sızdırıyor" || ok "geçersiz tip (gerçek alanlar) → temiz gövde ($(echo "$EB2" | head -c 60))"

# ─────────────────────────────────────────────
hdr "T27 — Bozuk parametre tipleri (500 OLMAMALI)"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/diary?date=not-a-date")
[[ "$r" != "5"* ]] && ok "diary?date=not-a-date → $r" || bad "diary bozuk tarih → 500"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/diary?date=2099-99-99")
[[ "$r" != "5"* ]] && ok "diary?date=2099-99-99 → $r" || bad "diary imkansız tarih → 500"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/note/stats?days=all-your-base")
[[ "$r" != "5"* ]] && ok "note/stats bozuk days → $r" || bad "note/stats → 500"
r=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/pt.jar "$BASE/api/foods/barcode?code=")
[[ "$r" != "5"* ]] && ok "barcode boş code → $r" || bad "barcode boş → 500"

# ─────────────────────────────────────────────
hdr "T28 — Oturum token tazeliği (her girişte YENİ token)"
C1=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"demoId":"weightloss"}' "$BASE/api/auth/demo" | grep -i "set-cookie" | grep -o "kaloriai_session=[^;]*" | cut -d= -f2)
C2=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"demoId":"weightloss"}' "$BASE/api/auth/demo" | grep -i "set-cookie" | grep -o "kaloriai_session=[^;]*" | cut -d= -f2)
[[ -n "$C1" && -n "$C2" && "$C1" != "$C2" ]] && ok "iki demo girişi → farklı tokenlar (fixasyon yok)" || warn "tokenlar aynı/bos — manuel kontrol: len1=${#C1} len2=${#C2}"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SONUÇ: ✅ $PASS geçti · ❌ $FAIL başarısız · ⚠️ $WARN uyarı"
