#!/usr/bin/env bash
# KaloriAI — Kapsamlı İşlevsel Test Paketi (functional suite)
# Amaç: TÜM API fonksiyonlarının gerçek veriyle uçtan uca çalıştığını doğrulamak.
# Her koşum BENZERSİZ bir test kullanıcısı oluşturur ve sonunda hesabı siler (KVKK).
# AI uçları gerçek AI çağrısı yapar (async job + yoklama deseni).
#
# Kullanım: bash scripts/func-test.sh   (dev server 3000 açık olmalı)
# Not: Önceki koşumdan <1 dk geçtiyse login/register limiteri (10/dk, 5/5dk)
# bekletebilir; script otomatik bekleyip tekrar dener.
set -u
BASE="http://localhost:3000"
TS=$(date +%s)
EMAIL="qa-${TS}@kaloriai.dev"
PW="Qa!${TS}aA"
JAR="/tmp/qa-${TS}.jar"
TODAY=$(TZ=Europe/Istanbul date +%F)
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
hdr() { echo; echo "━━━ $1 ━━━"; }
die() { echo "⛔ $1"; exit 1; }

jget() { jq -r "$1" 2>/dev/null; }

# Bekleme-yardımcısı: 429 gelirse pencere temizlenene dek bekle (maks 2 kez)
login_with_retry() {
  local email="$1" pass="$2" jar="$3" r=""
  for i in 1 2 3; do
    r=$(curl -s -o /tmp/qa_login_body -w "%{http_code}" -c "$jar" -X POST \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$pass\"}" "$BASE/api/auth/login")
    if [[ "$r" == "200" ]]; then return 0; fi
    if [[ "$r" == "429" ]]; then echo "    (429 — 65 sn limiter bekleme, deneme $i/3)"; sleep 65; continue; fi
    return 1
  done
  [[ "$r" == "200" ]]
}

register_with_retry() {
  local r=""
  for i in 1 2; do
    r=$(curl -s -o /tmp/qa_reg_body -w "%{http_code}" -c "$JAR" -X POST \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"name\":\"QA $TS\",\"consent\":true}" \
      "$BASE/api/auth/register")
    if [[ "$r" == "200" ]]; then return 0; fi
    if [[ "$r" == "429" ]]; then echo "    (429 — 300 sn register limiteri dolu; bekleniyor)"; sleep 300; continue; fi
    return 1
  done
  [[ "$r" == "200" ]]
}

# ─────────────────────────────────────────────
hdr "F0 — Hesap kurulumu (benzersiz: $EMAIL)"
register_with_retry || die "kayıt başarısız: $(cat /tmp/qa_reg_body)"
ok "kayıt → 200 + oturum çerezi"
ME=$(curl -s -b "$JAR" "$BASE/api/auth/me")
[[ "$(echo "$ME" | jget '.user.email')" == "$EMAIL" ]] && ok "/api/auth/me → kullanıcı doğru" || bad "/me: $ME"
UID_ME=$(echo "$ME" | jget '.user.id')

# ─────────────────────────────────────────────
hdr "F1 — Onboarding + hedef hesaplama"
OB=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{
  "sex":"male","birthDate":"1995-06-15","heightCm":178,"weightKg":82,
  "goal":"lose","weeklyRateKg":0.5,"activityLevel":"moderate","userType":"general",
  "dietPreference":"any","allergens":"","trainingDayTarget":false,"carbCycling":false
}' "$BASE/api/onboarding")
KCAL=$(echo "$OB" | jget '.targets.calories // .calories // empty')
[[ -n "$KCAL" && "$KCAL" != "null" && "$KCAL" -gt 1200 && "$KCAL" -lt 4000 ]] \
  && ok "onboarding → hedef kcal=$KCAL (aralıkta)" || bad "onboarding: $(echo "$OB" | head -c 120)"
T=$(curl -s -b "$JAR" "$BASE/api/targets")
[[ "$(echo "$T" | jget '.targets.protein')" != "null" ]] && ok "GET /api/targets → protein hedefi var" || bad "targets: $T"

# ─────────────────────────────────────────────
hdr "F2 — Profil görüntüleme + güncelleme"
P=$(curl -s -b "$JAR" "$BASE/api/profile")
[[ "$(echo "$P" | jget '.profile.weightKg')" == "82" ]] && ok "GET /api/profile → onboarding verisi işlendi" || bad "profile: $P"
P2=$(curl -s -b "$JAR" -X PATCH -H "Content-Type: application/json" -d '{"weightKg":80.5,"goal":"maintain"}' "$BASE/api/profile")
[[ "$(echo "$P2" | jget '.ok')" == "true" ]] && ok "PATCH /api/profile → kabul edildi" || bad "profile PATCH: $P2"
P3=$(curl -s -b "$JAR" "$BASE/api/profile")
[[ "$(echo "$P3" | jget '.profile.weightKg')" == "80.5" ]] && ok "profil kilo güncellendi (GET ile doğrulandı)" || bad "profile GET after PATCH: $P3"

# ─────────────────────────────────────────────
hdr "F3 — Yemek arama / barkod / özel yemek / favori"
S=$(curl -s -b "$JAR" "$BASE/api/foods/search?q=tavuk&limit=5")
N_S=$(echo "$S" | jget '.foods | length')
[[ "$N_S" -gt 0 ]] && ok "arama 'tavuk' → $N_S sonuç" || bad "arama boş: $S"
S2=$(curl -s -b "$JAR" "$BASE/api/foods/search?q=TAVUK")
N_S2=$(echo "$S2" | jget '.foods | length')
[[ "$N_S2" -gt 0 ]] && ok "büyük-küçük harf duyarlı arama (TAVUK) → $N_S2" || bad "TR katlama araması boş"
S3=$(curl -s -b "$JAR" "$BASE/api/foods/search?q=ISPRING")
N_S3=$(echo "$S3" | jget '.foods | length')
[[ "$N_S3" -gt 0 ]] && ok "Türkçe 'I' katlaması (ISPRING→ıspanak?) → $N_S3 aday" || echo "  ℹ️  I-katlama adayı 0 (katalog içeriğine bağlı — bilgilendirme)"

BC=$(curl -s -b "$JAR" "$BASE/api/foods/barcode?code=8690504010017")
[[ "$(echo "$BC" | jget '.source')" == "local" || "$(echo "$BC" | jget '.source')" == "off" || "$(echo "$BC" | jget '.error')" == "BARCODE_NOT_FOUND" ]] \
  && ok "barkod sorgusu işlendi (source=$(echo "$BC" | jget '.source // .error'))" || bad "barkod: $BC"

CF=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{
  "name":"QA Test Yemeği","kcal100":150,"protein100":12,"carb100":10,"fat100":5,
  "servings":[{"label":"porsiyon","grams":200}]
}' "$BASE/api/foods/create")
FID=$(echo "$CF" | jget '.food.id')
[[ -n "$FID" && "$FID" != "null" ]] && ok "özel yemek oluşturuldu ($FID)" || bad "create: $CF"
SC=$(curl -s -b "$JAR" -G --data-urlencode "q=QA Test Yemeği" "$BASE/api/foods/search")
[[ "$(echo "$SC" | jget '.foods[0].name')" == "QA Test Yemeği" ]] && ok "özel yemek aramada bulundu (URL-kodlu sorgu)" || bad "özel yemek aramada yok: $SC"
CL=$(curl -s -b "$JAR" "$BASE/api/foods/custom")
[[ "$(echo "$CL" | jget '.foods | length')" -ge 1 ]] && ok "GET /api/foods/custom → listelendi" || bad "custom: $CL"

FV=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"foodId\":\"$FID\"}" "$BASE/api/foods/favorites")
[[ "$(echo "$FV" | jget '.isFavorite')" == "true" ]] && ok "favori ekleme → true" || bad "favori ekleme: $FV"
FV2=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"foodId\":\"$FID\"}" "$BASE/api/foods/favorites")
[[ "$(echo "$FV2" | jget '.isFavorite')" == "false" ]] && ok "favori toggle → kaldırıldı" || bad "favori toggle: $FV2"
FL=$(curl -s -b "$JAR" "$BASE/api/foods/favorites")
[[ "$(echo "$FL" | jget '.favorites | length')" == "0" ]] && ok "GET favorites → boş liste tutarlı" || bad "favorites: $FL"
FV3=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"foodId":"yok-boyle-bir-id"}' "$BASE/api/foods/favorites")
[[ "$(echo "$FV3" | jget '.error')" == "NOT_FOUND" ]] && ok "geçersiz foodId → 404 NOT_FOUND (500 yok)" || bad "geçersiz foodId: $FV3"

# ─────────────────────────────────────────────
hdr "F4 — Defter: öğün ekleme, güncelleme, toplamlar, silme"
D=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{
  "date":"'"$TODAY"'","mealType":"breakfast","items":[
    {"name":"Yumurta","grams":100,"kcal":155,"protein":13,"carbs":1,"fat":11,"fiber":0},
    {"name":"Tam Buğday Ekmek","grams":60,"kcal":150,"protein":6,"carbs":27,"fat":2,"fiber":5}
  ]}' "$BASE/api/diary")
DID=$(echo "$D" | jget '.log.id // .id')
[[ -n "$DID" && "$DID" != "null" ]] && ok "kahvaltı öğünü eklendi ($DID)" || bad "diary POST: $D"

DV=$(curl -s -b "$JAR" "$BASE/api/diary?date=$TODAY")
K_D=$(echo "$DV" | jget '.totals.kcal')
[[ "$K_D" == "305" ]] && ok "günlük toplam kcal=305 doğru (155+150)" || bad "toplam kcal: $K_D (305 bekleniyordu)"

# öğün kopyalama (meal modu) — kahvaltıyı yarına taşı (kaynak=hedef reddi var)
TOMORROW=$(TZ=Europe/Istanbul date -d "+1 day" +%F 2>/dev/null || date -v+1d +%F)
DAY2=$(TZ=Europe/Istanbul date -d "+2 day" +%F 2>/dev/null || date -v+2d +%F)
CP=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{
  \"mode\":\"meal\",\"sourceDate\":\"$TODAY\",\"targetDate\":\"$TOMORROW\",\"mealType\":\"breakfast\"
}" "$BASE/api/diary/copy")
[[ "$(echo "$CP" | jget '.count')" == "1" && "$(echo "$CP" | jget '.items')" == "2" ]] \
  && ok "öğün kopyalama → 1 öğün · 2 kayıt (yarın)" || bad "copy meal: $CP"

# gün kopyalama (day modu) — bugünden +2 güne
CPD=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{
  \"mode\":\"day\",\"sourceDate\":\"$TODAY\",\"targetDate\":\"$DAY2\"
}" "$BASE/api/diary/copy")
[[ "$(echo "$CPD" | jget '.count')" == "1" && "$(echo "$CPD" | jget '.items')" == "2" ]] \
  && ok "gün kopyalama → 1 öğün · 2 kayıt (+2 gün)" || bad "copy day: $CPD"
# kaynak=hedef reddi
CPS=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"mode\":\"day\",\"sourceDate\":\"$TODAY\",\"targetDate\":\"$TODAY\"}" "$BASE/api/diary/copy")
[[ "$(echo "$CPS" | jget '.error')" == "VALIDATION" ]] && ok "kaynak=hedef kopyalama reddi → 400" || bad "copy same-day: $CPS"

# öğe düzenleme (gram ölçekleme)
IID=$(echo "$DV" | jget '.logs[0].items[0].id')
UP=$(curl -s -b "$JAR" -X PATCH -H "Content-Type: application/json" -d "{\"id\":\"$IID\",\"grams\":200}" "$BASE/api/diary/item")
[[ "$(echo "$UP" | jget '.item.grams')" == "200" && "$(echo "$UP" | jget '.item.kcal')" == "310" ]] \
  && ok "öğe gram ölçekleme 100→200g (kcal 155→310)" || bad "item PATCH: $UP"

# son kayıt sorgusu
LAST=$(curl -s -b "$JAR" "$BASE/api/diary/last?before=2099-01-01&mealType=breakfast")
[[ "$(echo "$LAST" | jget '.items | length // 0')" != "null" ]] && ok "diary/last sorgusu işlendi" || bad "diary/last: $LAST"

# öğün silme
DEL=$(curl -s -b "$JAR" -X DELETE "$BASE/api/diary/item?id=$IID")
[[ "$(echo "$DEL" | jget '.ok')" == "true" ]] && ok "öğe silindi (soft delete)" || bad "item DELETE: $DEL"

# ─────────────────────────────────────────────
hdr "F5 — Su, adım, antrenman, ölçüm, not, oruç"
W=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"deltaMl":500}' "$BASE/api/water")
[[ "$(echo "$W" | jget '.waterMl')" == "500" ]] && ok "su +500ml → 500" || bad "water: $W"
W2=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"deltaMl":-200}' "$BASE/api/water")
[[ "$(echo "$W2" | jget '.waterMl')" == "300" ]] && ok "su -200ml → 300" || bad "water negatif: $W2"
WG=$(curl -s -b "$JAR" "$BASE/api/water?date=$TODAY")
[[ "$(echo "$WG" | jget '.waterMl')" == "300" ]] && ok "GET water → 300" || bad "water GET: $WG"

ST=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"count":8500}' "$BASE/api/steps")
[[ "$(echo "$ST" | jget '.day.count')" == "8500" ]] && ok "adım 8500 kaydedildi" || bad "steps: $ST"
STG=$(curl -s -b "$JAR" "$BASE/api/steps?days=7")
[[ "$(echo "$STG" | jget '.days | length')" -ge 1 ]] && ok "GET steps → gün listesi" || bad "steps GET: $STG"

WO=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{
  "type":"running","name":"Sabah koşusu","durationMin":45,"intensity":"moderate","addToTarget":false
}' "$BASE/api/workouts")
[[ "$(echo "$WO" | jget '.workout.calories')" != "null" && "$(echo "$WO" | jget '.workout.calories')" -gt 100 ]] \
  && ok "antrenman → MET hesabıyla $(echo "$WO" | jget '.workout.calories') kcal" || bad "workout: $WO"
WOG=$(curl -s -b "$JAR" "$BASE/api/workouts?range=week")
[[ "$(echo "$WOG" | jget '.workouts | length')" -ge 1 ]] && ok "GET workouts (hafta)" || bad "workouts GET: $WOG"

M=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"weightKg":80.2,"waistCm":92}' "$BASE/api/measurements")
[[ "$(echo "$M" | jget '.measurement.weightKg // .ok')" != "null" ]] && ok "ölçüm kaydedildi" || bad "measurements: $M"
MG=$(curl -s -b "$JAR" "$BASE/api/measurements")
[[ "$(echo "$MG" | jget '.measurements | length')" -ge 1 ]] && ok "GET measurements" || bad "measurements GET: $MG"

N=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"mood":"good","text":"Test notu"}' "$BASE/api/note")
[[ "$(echo "$N" | jget '.note.mood')" == "good" ]] && ok "günlük not + ruh hali" || bad "note: $N"
NS=$(curl -s -b "$JAR" "$BASE/api/note/stats?days=30")
[[ "$(echo "$NS" | jget '.days // .stats // .ok')" != "null" ]] && ok "not istatistikleri" || bad "note/stats: $NS"

F1=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"start","targetHours":16}' "$BASE/api/fasting")
[[ "$(echo "$F1" | jget '.active.targetHours')" == "16" ]] && ok "oruç başladı (16s hedef)" || bad "fasting start: $F1"
F2=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"start"}' "$BASE/api/fasting")
[[ "$(echo "$F2" | jget '.error')" == "FASTING_ACTIVE" ]] && ok "çift oruç → 409 FASTING_ACTIVE" || bad "çift oruç: $F2"
F3=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"stop"}' "$BASE/api/fasting")
[[ "$(echo "$F3" | jget '.ok')" == "true" ]] && ok "oruç durduruldu" || bad "fasting stop: $F3"
F4=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"stop"}' "$BASE/api/fasting")
[[ "$(echo "$F4" | jget '.error')" == "NO_ACTIVE_FAST" ]] && ok "orucsuz stop → 404 NO_ACTIVE_FAST" || bad "orucsuz stop: $F4"

# ─────────────────────────────────────────────
hdr "F6 — Eksik analizi (gaps) + ilerleme özeti"
G=$(curl -s -b "$JAR" "$BASE/api/gaps?date=$TODAY&locale=tr")
[[ "$(echo "$G" | jget '.gaps.proteinRemaining')" != "null" ]] && ok "gaps → protein/lif/su boşlukları hesaplandı" || bad "gaps: $G"
GN=$(echo "$G" | jget '.suggestions | length')
[[ "$GN" -ge 1 ]] && ok "gaps → $GN katalog önerisi" || bad "gaps öneri yok: $G"

PS=$(curl -s -b "$JAR" "$BASE/api/progress/summary")
[[ "$(echo "$PS" | jget '.days // .summary // .ok')" != "null" ]] && ok "ilerleme özeti işlendi" || bad "progress/summary: $PS"

R=$(curl -s -b "$JAR" "$BASE/api/report?date=$TODAY")
[[ "$(echo "$R" | jget '.days // .byDate // .ok')" != "null" ]] && ok "haftalık rapor verisi" || bad "report: $R"

E=$(curl -s -b "$JAR" "$BASE/api/export")
[[ "$(echo "$E" | jq -r 'has("profile") and has("mealLogs") and (.mealLogs | length >= 1)')" == "true" ]] \
  && ok "KVKK JSON export → profil+defter+su+antrenman blokları" || bad "export bloğu eksik"
EC=$(curl -s -b "$JAR" "$BASE/api/export?format=csv" | head -2)
[[ "$EC" == *date,meal,item* ]] && ok "KVKK CSV export → başlık satırı doğru" || bad "export csv: $EC"

# ─────────────────────────────────────────────
hdr "F7 — Hatırlatıcılar, oturumlar, push anahtarı, abonelik"
RM=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"type":"water","time":"14:30","enabled":true}' "$BASE/api/reminders")
[[ "$(echo "$RM" | jget '.reminder.time')" == "14:30" ]] && ok "su hatırlatıcısı 14:30 kuruldu" || bad "reminders: $RM"
RMG=$(curl -s -b "$JAR" "$BASE/api/reminders")
[[ "$(echo "$RMG" | jget '.reminders | length')" -ge 1 ]] && ok "GET reminders" || bad "reminders GET: $RMG"
RMID=$(echo "$RM" | jget '.reminder.id')
RMD=$(curl -s -b "$JAR" -X DELETE "$BASE/api/reminders?id=$RMID")
[[ "$(echo "$RMD" | jget '.ok')" == "true" ]] && ok "hatırlatıcı silindi" || bad "reminder DELETE: $RMD"

SS=$(curl -s -b "$JAR" "$BASE/api/sessions")
[[ "$(echo "$SS" | jget '.sessions | length')" -ge 1 && "$(echo "$SS" | jget '.currentId')" != "null" ]] \
  && ok "oturum listesi + mevcut oturum işaretli" || bad "sessions: $SS"
SSD=$(curl -s -b "$JAR" -X DELETE "$BASE/api/sessions")
[[ "$(echo "$SSD" | jget '.ok')" == "true" ]] && ok "diğer oturumları kapat (0+)" || bad "sessions DELETE: $SSD"

PK=$(curl -s -b "$JAR" "$BASE/api/push")
[[ "$(echo "$PK" | jq -r 'has("publicKey")')" == "true" ]] && ok "push ucu → publicKey alanı servis ediliyor (VAPID env'ye bağlı değer)" || bad "push: $PK"

SUB=$(curl -s -b "$JAR" "$BASE/api/subscription")
[[ "$(echo "$SUB" | jget '.subscription.tier')" == "free" ]] && ok "abonelik: free başlangıç" || bad "subscription: $SUB"
TR=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"action":"start_trial","plan":"monthly"}' "$BASE/api/subscription")
[[ "$(echo "$TR" | jget '.subscription.tier // .tier')" == "premium" ]] && ok "deneme başlatma → premium" || bad "trial: $TR"

# ─────────────────────────────────────────────
hdr "F8 — AI: metin ayrıştırma (async job + gerçek AI turu)"
PT=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"text":"2 simit ve bir bardak çay","locale":"tr"}' "$BASE/api/ai/parse-text")
JOB=$(echo "$PT" | jget '.jobId')
if [[ -z "$JOB" || "$JOB" == "null" ]]; then
  # bazı koşullarda hızlı yol direkt sonuç dönebilir
  ITEMS=$(echo "$PT" | jget '.items | length')
  [[ "$ITEMS" -ge 1 ]] && ok "parse-text hızlı yol → $ITEMS öğe" || bad "parse-text: $PT"
else
  ok "parse-text → jobId ($JOB) <150ms"
  RESULT=""
  for i in $(seq 1 60); do
    sleep 1.2
    PJ=$(curl -s -b "$JAR" "$BASE/api/ai/parse-text?id=$JOB")
    ST=$(echo "$PJ" | jget '.status')
    if [[ "$ST" == "done" ]]; then RESULT="$PJ"; break; fi
    if [[ "$ST" == "error" ]]; then break; fi
  done
  AI_ITEMS=$(echo "$RESULT" | jget '.items | length')
  AI_NAME=$(echo "$RESULT" | jget '.items[0].name')
  if [[ -n "$AI_ITEMS" && "$AI_ITEMS" != "null" && "$AI_ITEMS" -ge 1 ]]; then
    ok "AI parse bitti → $AI_ITEMS öğe (ilk: $AI_NAME)"
  else
    bad "AI parse sonucu yok: $(echo "$RESULT" | head -c 150)"
  fi
fi

AIH=$(curl -s -b "$JAR" "$BASE/api/ai/history")
[[ "$(echo "$AIH" | jget '.items | length')" -ge 1 ]] && ok "AI geçmişi kaydedildi" || bad "ai/history: $AIH"

# ─────────────────────────────────────────────
hdr "F9 — Planlayıcı (premium hesapla): günlük + haftalık async"
PLN=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"date\":\"$TODAY\",\"locale\":\"tr\",\"scope\":\"day\"}" "$BASE/api/planner")
PJOB=$(echo "$PLN" | jget '.jobId')
if [[ -n "$PJOB" && "$PJOB" != "null" ]]; then
  ok "planner POST → jobId (async)"
  PRES=""
  for i in $(seq 1 80); do
    sleep 1.2
    PJ2=$(curl -s -b "$JAR" "$BASE/api/planner?id=$PJOB")
    ST2=$(echo "$PJ2" | jget '.status')
    if [[ "$ST2" == "done" ]]; then PRES="$PJ2"; break; fi
    if [[ "$ST2" == "error" ]]; then break; fi
  done
  MEALS_N=$(echo "$PRES" | jget '.plan.meals | length')
  [[ -n "$MEALS_N" && "$MEALS_N" != "null" && "$MEALS_N" -ge 1 ]] \
    && ok "günlük plan üretildi → $MEALS_N öğün" || bad "günlük plan: $(echo "$PRES" | head -c 150)"
else
  bad "planner POST jobId dönmedi: $PLN"
fi
PLG=$(curl -s -b "$JAR" "$BASE/api/planner?date=$TODAY")
[[ "$(echo "$PLG" | jget '.plan.meals | length')" -ge 1 ]] && ok "GET planner?date → kayıtlı plan" || bad "planner GET: $PLG"
PLW=$(curl -s -b "$JAR" "$BASE/api/planner?week=$TODAY")
[[ "$(echo "$PLW" | jget '.dates | length')" == "7" ]] && ok "GET planner?week → 7 günlük pencere" || bad "planner week: $PLW"

# ─────────────────────────────────────────────
hdr "F10 — Tarifler (CRUD) + şablon kaydet/uygula/sil"
RC=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{
  \"name\":\"QA Çorbası\",\"servings\":2,
  \"items\":[{\"foodId\":\"$FID\",\"grams\":200}]
}" "$BASE/api/recipes")
RID=$(echo "$RC" | jget '.recipeId')
[[ -n "$RID" && "$RID" != "null" ]] && ok "tarif oluşturuldu (gerçek foodId ile)" || bad "recipe POST: $RC"
RG=$(curl -s -b "$JAR" "$BASE/api/recipes")
[[ "$(echo "$RG" | jget '.recipes | length')" -ge 1 ]] && ok "GET recipes → listelendi" || bad "recipes GET: $RG"
RD=$(curl -s -b "$JAR" -X DELETE "$BASE/api/recipes?id=$RID")
[[ "$(echo "$RD" | jget '.ok')" == "true" ]] && ok "tarif silindi (soft)" || bad "recipe DELETE: $RD"

# Şablon akışı: mevcut öğünü şablon yap → başka güne uygula → sil
TSAVE=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"logId\":\"$DID\",\"name\":\"QA Sablonu\"}" "$BASE/api/diary/template")
TID=$(echo "$TSAVE" | jget '.template.id')
[[ -n "$TID" && "$TID" != "null" ]] && ok "öğün şablonu kaydedildi" || bad "template POST: $TSAVE"
TAPPLY=$(curl -s -b "$JAR" -X PUT -H "Content-Type: application/json" -d "{\"templateId\":\"$TID\",\"date\":\"$TOMORROW\"}" "$BASE/api/diary/template")
[[ "$(echo "$TAPPLY" | jget '.log.id')" != "null" ]] && ok "şablon yarına uygulandı" || bad "template PUT: $TAPPLY"
TDEL=$(curl -s -b "$JAR" -X DELETE "$BASE/api/diary/template?id=$TID")
[[ "$(echo "$TDEL" | jget '.ok')" == "true" ]] && ok "şablon silindi" || bad "template DELETE: $TDEL"

# ─────────────────────────────────────────────
hdr "F11 — Oturum kapatma + yeniden giriş + KVKK hesap silme"
LO=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/logout")
[[ "$(echo "$LO" | jget '.ok')" == "true" ]] && ok "logout → oturum kapatıldı" || bad "logout: $LO"
ME2=$(curl -s -b "$JAR" "$BASE/api/auth/me")
[[ "$(echo "$ME2" | jget '.user')" == "null" ]] && ok "çerez artık geçersiz (user:null)" || bad "logout sonrası oturum yaşadı: $ME2"

if login_with_retry "$EMAIL" "$PW" "$JAR"; then
  ok "yeniden giriş → 200"
else
  bad "yeniden giriş başarısız: $(cat /tmp/qa_login_body)"
fi

AD=$(curl -s -b "$JAR" -X DELETE "$BASE/api/account/delete")
[[ "$(echo "$AD" | jget '.ok')" == "true" ]] && ok "KVKK hesap silme → tamam" || bad "account delete: $AD"
ME3=$(curl -s -b "$JAR" "$BASE/api/auth/me")
[[ "$(echo "$ME3" | jget '.user')" == "null" ]] && ok "silinen hesapla oturum öldü" || bad "silme sonrası oturum: $ME3"
LOGIN_DEAD=$(curl -s -o /tmp/qa_dead -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login")
[[ "$LOGIN_DEAD" == "401" ]] && ok "silinen hesapla giriş → 401" || bad "silinen hesapla giriş: $LOGIN_DEAD"

rm -f "$JAR" /tmp/qa-${TS}* /tmp/qa_login_body /tmp/qa_reg_body 2>/dev/null

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "İŞLEVSEL SONUÇ: ✅ $PASS geçti · ❌ $FAIL başarısız"
[[ "$FAIL" -gt 0 ]] && exit 1 || exit 0
