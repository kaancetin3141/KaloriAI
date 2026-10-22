#!/usr/bin/env bash
# ============================================================================
# KaloriAI — SQLite veritabanı yedeği (Task 5-c)
#
# Ne yapar:
#   1. .env içindeki DATABASE_URL'den DB dosyasını çözer (varsayılan db/custom.db)
#   2. sqlite3 varsa WAL-safe online yedek alır (.backup + .timeout 5000);
#      sqlite3 yoksa dosya kopyasıyla (cp) düşer — sqlite3 kurulumu önerilir
#   3. Yedeği gzip'ler: db/backups/kaloriai-YYYYMMDD-HHMMSS.db.gz
#   4. Yalnızca en yeni 7 yedeği tutar, eskilerini siler
#   5. Tek satırlık sonuç logu basar; hata durumunda 0'dan farklı çıkar
#
# Cron örneği (her gece 04:00):
#   0 4 * * * /opt/kaloriai/scripts/backup-db.sh >> /var/log/kaloriai-backup.log 2>&1
#
# Geri yükleme: DEPLOYMENT.md → "Yedekleme — scripts/backup-db.sh" bölümü.
# ============================================================================
set -euo pipefail

# Proje kökü: script nereden çağrılırsa çağrılsın kök dizine göre çalış
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# --- DB yolunu çöz (.env DATABASE_URL=file:...) -----------------------------
DB_FILE="$ROOT_DIR/db/custom.db"
if [[ -f "$ROOT_DIR/.env" ]]; then
  env_url="$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$ROOT_DIR/.env" | tail -n 1 | tr -d '"'"'"'')"
  if [[ "$env_url" == file:* && -n "${env_url#file:}" ]]; then
    candidate="${env_url#file:}"
    case "$candidate" in
      /*) DB_FILE="$candidate" ;;
      *)  DB_FILE="$ROOT_DIR/$candidate" ;;
    esac
  fi
fi

if [[ ! -f "$DB_FILE" ]]; then
  echo "[backup-db] HATA: veritabanı bulunamadı: $DB_FILE" >&2
  exit 1
fi

BACKUP_DIR="$(dirname "$DB_FILE")/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/kaloriai-$STAMP.db.gz"
KEEP=7

mkdir -p "$BACKUP_DIR"

# --- Yedek al (sqlite3 .backup → yoksa cp fallback) --------------------------
raw_tmp="$(mktemp "$BACKUP_DIR/.kaloriai-backup-$STAMP.XXXXXX")"
trap 'rm -f "$raw_tmp"' EXIT

if command -v sqlite3 >/dev/null 2>&1; then
  # Online, WAL-safe tutarlı anlık görüntü; kilit meşguliyse 5 sn bekle
  sqlite3 "$DB_FILE" ".timeout 5000" ".backup '$raw_tmp'"
  method="sqlite3-backup"
else
  # sqlite3 yok: düz dosya kopyası. WAL modunda en son yazılar -wal dosyasında
  # kalabilir → üretimde `apt install sqlite3` şiddetle önerilir.
  cp "$DB_FILE" "$raw_tmp"
  sync
  method="copy-fallback"
fi

# Boş/tepel kopyayı yedeği sayma
if [[ ! -s "$raw_tmp" ]]; then
  echo "[backup-db] HATA: yedek kopyası boş olu ($DB_FILE)" >&2
  exit 1
fi

gzip -c "$raw_tmp" > "$TARGET"

# --- Eski yedekleri kırp (en yeni KEEP adet kalır) ---------------------------
pruned=0
while IFS= read -r old; do
  rm -f -- "$old"
  pruned=$((pruned + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'kaloriai-*.db.gz' | sort -r | tail -n +$((KEEP + 1)))

# --- Tek satır sonuç logu -----------------------------------------------------
size="$(du -h "$TARGET" | cut -f1)"
echo "[backup-db] OK method=$method db=$DB_FILE file=$TARGET size=$size kept=$((KEEP)) pruned=$pruned"
