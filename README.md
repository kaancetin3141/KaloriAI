# KaloriAI — AI Destekli Kalori & Beslenme Takibi 🥗📸

Fotoğraf çek, kalorini bil. Yemek fotoğrafını AI analiz eder, kullanıcı düzeltir ve kaydeder. Türk mutfağı önceliği (mantı, lahmacun, börek, kebap, mercimek çorbası…), sporcu modu, adaptif TDEE, premium üyelik.

> **Not (ortam uyarlama):** Orijinal spesifikasyon Expo/Supabase hedefliydi; bu ortamın zorunlu stack'i **Next.js 16 (App Router) + TypeScript + Prisma/SQLite** olduğu için ürünün **web sürümü** uygulanmıştır. Katman birebir karşılıklıdır: Edge Function → API Route, Supabase Storage → özel upload klasörü + sahip kontrolü, Claude Vision → z-ai-web-dev-sdk VLM, RevenueCat → simüle abonelik akışı.

## ✨ Özellikler

| Alan | Detay |
|---|---|
| 🔐 **Auth** | E-posta/şifre (scrypt hash), httpOnly cookie oturum, KVKK onay kaydı, hesap silme, JSON/CSV veri dışa aktarımı |
| 🧭 **Onboarding** | Zorunlu 6 adım: dil → beden → hedef → aktivite/kullanıcı tipi → beslenme tercihi/alerjenler → plan önizleme |
| 🎯 **Hedef hesabı** | Mifflin-St Jeor / Katch-McArdle (yağ oranı varsa), TDEE aktivite çarpanı, güvenlik tabanı (♀1200/♂1500 kcal), saf fonksiyonlar + `src/lib/calculations.ts` |
| 📸 **AI fotoğraf analizi** | Kamera (getUserMedia) veya dosya → sıkıştırma (sharp) → vision LLM → **katı JSON şeması** (öğe, gram, kcal, makro, lif, güven skoru 0-1, alternatifler, doğrulama sorusu). Sonuç **tam düzenlenebilir**; onaylanmadan deftere hiçbir şey yazılmaz |
| ✍️ **Metin girişi** | "2 yumurta ve 1 dilim ekmek yedim" → LLM ayrıştırma → aynı düzenleme ekranı |
| 📔 **Yemek defteri** | Öğün grupları, tarih gezinme, porsiyon düzenleme (makrolar orantılı ölçeklenir), öğün/gün kopyalama, şablonlar, hızlı ekleme (sadece kalori), mikro besinler |
| 🥦 **Mikro besinler** | Cronometer tarzı günlük panel: **lif (hedef, 14g/1000kcal)**, **şeker + doymuş yağ (≤%10 enerji)** ve **sodyum (≤2300 mg)** — sınırlar hedef kaloriden türetilir, aşım durumunda amber/kırmızı uyarı; tüm giriş yollarından (arama, barkod, tarif, kopya, şablon) otomatik taşınır |
| 🔍 **Gıda veritabanı** | 101 Türk yemeği (seed, doğrulanmış), Open Food Facts **canlı API** (arama + barkod), özel gıda oluşturma, favoriler, sık yenilenler öğrenmesi |
| 📷 **Barkod** | Manuel giriş + `BarcodeDetector` API kamera okutma (destekleyen tarayıcılarda) |
| 💧 **Su takibi** | Kiloya göre hedef (35 ml/kg), bardak ekleme, hazır porsiyonlar (200/330/500 ml) + özel miktar, optimistik UI |
| 🏋️ **Sporcu modu** | Antrenman kaydı (MET bazlı kalori, 10 tür), antrenman/dinlenme günü hedefleri, karbonhidrat döngüsü, protein dağılımı (0.4 g/kg/öğün), antrenman öncesi/sonrası öneriler, vücut ölçümleri, kilo trendi |
| 📈 **İlerleme** | Kalori/makro/kilo/su grafikleri (recharts), 7 günlük hareketli ortalama, seri (streak), uyum %, **adaptif TDEE** (MacroFactor tarzı: alım + kilo trendinden harcama tahmini), AI haftalık içgörüler, premium ilerleme fotoğrafları |
| 🧠 **AI Koç** | Bağlam-duyarlı sohbet (kalan kalori/makro bilinciyle Türkçe öneriler) |
| 🗓️ **Planlayıcı** (Premium) | Hedefe uygun AI günlük yemek planı + alışveriş listesi + deftere tek tıkla aktarım |
| 💎 **Premium** | 7 gün deneme, aylık/yıllık plan, ücretsiz katmana günlük 5 AI analiz kotası, paywall |
| 🌐 **i18n** | Türkçe (varsayılan) + İngilizce — tüm metinler `src/lib/i18n/{tr,en}.ts` |
| ⚖️ **Birim sistemi** | Gerçek metrik/İmperial dönüşüm (`src/lib/units.ts`): onboarding'de birim seçimi (lb, ft+inç), profil/ölçüm formları, kilo grafiği, projeksiyon ve haftalık oran — veriler her zaman metrik saklanır |
| 🌓 **Tema** | Açık/koyu (next-themes), yeşil/amber palet, erişilebilirlik (aria, 44px dokunma hedefleri), mobil-alt-tab + desktop-sidebar responsive düzen |

## 🚀 Çalıştırma

```bash
# 1) Bağımlılıklar (zaten kurulu)
bun install

# 2) Veritabanı şeması
bun run db:push

# 3) Türk yemekleri seed (101 gıda / 162 porsiyon — idempotent)
bun prisma/seed.ts

# 4) Geliştirme sunucusu (http://localhost:3000)
bun run dev
```

Önizleme: sağdaki **Preview Panel** (veya "Open in New Tab").

## 🔧 Ortam Değişkenleri

`.env.example` dosyasına bakın. Zorunlu tek değişken `DATABASE_URL`'dir; AI anahtarları **istemciye asla sızmaz** (z-ai SDK yalnızca sunucu tarafında).

## 🗄️ Veri Modeli (özet)

`User, Session, Profile, Targets, Food(+Serving), Recipe(+RecipeItem), MealLog(+MealLogItem), AiAnalysis, WaterLog, Workout, BodyMeasurement, ProgressPhoto, Favorite, Reminder, Subscription, UsageQuota, FrequentFood, AiChatMessage, PlannerDay` — soft delete (`deletedAt`), `createdAt/updatedAt`, `user_id+date` indeksleri, kullanıcıya özel satır erişimi tüm API'lerde oturum kontrolüyle uygulanır (RLS karşılığı).

## 🔌 API Haritası

```
/auth/register|login|logout|me   /onboarding        /targets (GET|PATCH)
/profile (GET|PATCH)             /foods/search      /foods/barcode
/foods/create                    /foods/favorites   /diary (GET|POST)
/diary/item (PATCH|DELETE)       /diary/copy        /diary/template (POST|PUT|DELETE)
/water                           /workouts          /measurements
/progress-photos                 /progress/summary  /ai/analyze-photo
/ai/parse-text                   /ai/insights       /ai/coach
/planner (GET|POST)              /subscription      /export?format=json|csv
/account/delete (DELETE)         /reminders         /files/[...path] (özel, sahip kontrollü)
```

## 🛡️ Güvenlik & Uyumluluk

- Zod ile tüm girdi doğrulaması; dosya tipi/boyut kontrolü (≤10MB, jpeg/png/webp)
- AI kota: ücretsiz 5 analiz/gün (`UsageQuota`), premium sınırsız
- Fotoğraflar kullanıcıya özel klasörde; `/api/files` sahiplik kontrolü yapar
- Yeme bozukluğu koruması: kalori tabanı, agresif dil yok, tıbbi uyarı metinleri
- KVKK/GDPR: onay kaydı (`consentAt`), veri taşınabilirliği (JSON/CSV), kalıcı silme

## ✅ Bilinen Boşluklar & Sonraki Adımlar

1. **Google/Apple OAuth** — sağlayıcı anahtarları olmadığından kapsam dışı; şema/oturum yapısı hazır
2. **RevenueCat gerçek entegrasyonu** — mevcut abonelik simülasyonu; webhook hazır model
3. **Push hatırlatıcılar** — web'de tarayıcı bildirimi entegrasyonu (veri modeli hazır)
4. **USDA FoodData Central** — `USDA_API_KEY` ile eklenebilir (ara kaynak)
5. **Çevrimdışı kuyruk** — hizmet çalışanıyla offline-first defter
6. **E2E/unit test paketi + CI** — hesaplama fonksiyonları saf ve test'e hazır
7. **PDF rapor** — şu an CSV/JSON; PDF için sunucu tarafı render eklenecek

## 🔒 Yayın Öncesi Güvenlik Denetimi (Pre-launch Security Audit)

Uygulama yayından önce statik analiz + aktif sızma testinden geçirildi (`scripts/pen-test.sh`, 57 kontrol):

| Koruma | Uygulama |
|---|---|
| **Kimlik doğrulama** | scrypt (16-byte rastgele salt, 64-byte anahtar, `timingSafeEqual`), httpOnly + SameSite/Partitioned çerez, 96-karakter oturum token'ı |
| **Brute-force** | İn-memory sliding-window rate limiter: giriş 5/dk (hesap) + 10/dk (IP), kayıt 5/5dk (IP), demo 15/dk (IP) |
| **CSRF** | Mutasyon isteklerinde same-origin zorlaması (`src/middleware.ts` — Origin/Sec-Fetch-Site kontrolü; iframe gömülü kullanım güvenli) |
| **IDOR** | Tüm veri uçları oturum sahibine kilitli; `/api/files/ai/<uid>/*` sahiplik kontrolü (403) |
| **Path traversal** | Segment doğrulama (`..` reddi) + separator-safe root kontrolü + yalnız `.jpg/.jpeg` uzantı whitelist + `nosniff` |
| **SSRF** | `src/lib/url-guard.ts`: private/loopback/link-local/cloud-metadata IP engeli (IPv4+IPv6, oktal/hex obfuscation dahil), DNS çözümlemeli doğrulama, redirect hop-hop kontrolü |
| **Enjeksiyon** | Prisma parametrelendirilmiş sorgular (raw SQL sıfır); Zod şema doğrulaması tüm uçlarda |
| **Dosya yüklemeleri** | Boyut limiti (≤10MB), sharp ile yeniden sıkıştırma (EXIF temizliği), kullanıcıya özel bucket |
| **Cron fail-closed** | `/api/push/cron` yalnız `x-cron-secret` ile; sır ayarlı değilse 401 (dahili zamanlayıcı bağımsız çalışır) |
| **Güvenlik başlıkları** | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` |

> **Bilinen tasarım kararı:** Abonelik yükseltmesi (`POST /api/subscription`) RevenueCat **simülasyonudur** — gerçek ödeme sağlayıcısı bağlanana kadar premium kendi kendine denenebilir. Üretime almadan önce gerçek bir billing entegrasyonu bağlanmalıdır.

## 🚀 Çalıştırma

```bash
cp .env.example .env        # DATABASE_URL vb.
bun install
bun run db:push             # şemayı SQLite'a uygula
bun run db:generate         # Prisma client
bun run dev                 # http://localhost:3000
```

Sağlık kontrolü: `bun scripts/db-check.ts` (bütünlük + FK + yetim kayıt + veri sanity) · Sızma testi: `bash scripts/pen-test.sh` (çalışan sunucuya karşı 57 kontrol)

## 🖥️ Ubuntu VDS'e Dağıtım

Uygulama tek-süreç (Next.js standalone + SQLite + yerel upload) mimarisiyle VDS'e **uygundur**. Tam rehber: **[DEPLOYMENT.md](DEPLOYMENT.md)** — gereksinimler, `.env` (VAPID/CRON_SECRET), systemd servisi, nginx + Let's Encrypt, yedekleme cronu, güncelleme ve üretim kontrol listesi.

Hazır şablonlar (`scripts/deploy/`): `kaloriai.service` · `nginx-kaloriai.conf` · `backup.sh` (SQLite WAL-safe) · `deploy.sh`

## 📄 Lisans

Tüm hakları saklıdır © 2026 Kaan Çetin. Ticari kullanım için iletişime geçin.
