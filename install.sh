#!/usr/bin/env bash
# Installer native aaPanel + Apache; tidak mengubah Python/Node.js bawaan panel.
set -Eeuo pipefail
umask 022

APP_DIR=/opt/kitab
DATA_DIR=/var/lib/kitab
RUNTIME_DIR=/opt/kitab-runtime
ENV_FILE=/etc/kitab.env
SERVICE_FILE=/etc/systemd/system/kitab.service
MARKER=/var/lib/kitab/.installed-domain
REPOSITORY=https://github.com/orygo-dev/kitabdigital.git
DOMAIN=''
CHECK_ONLY=0
TEMP_DIR=''
SERVICE_STARTED=0
SELINUX_CHANGED=0
APACHECTL=''
VHOST=''
APP_PORT=8000

say() { printf '\n%s\n' "$*"; }
die() { printf '\nGagal: %s\n' "$*" >&2; exit 1; }
fetch() { curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --retry 3 "$@"; }
as_app() { runuser -u kitab -- env -u DATABASE_URL -u PYTHONPATH -u PYTHONHOME "$@"; }
check_root() { [[ "$EUID" -eq 0 ]] || die 'Masuk terminal SSH sebagai root, lalu jalankan installer kembali.'; }
check_terminal() { : </dev/tty || die 'Gunakan terminal SSH interaktif agar akun admin dapat dibuat.'; }

usage() {
    cat <<'HELP'
Installer Kitab Digital untuk aaPanel dengan Apache.
Jalankan sebagai root setelah website dan SSL domain dibuat di aaPanel.

  bash install.sh                     Instalasi interaktif
  bash install.sh --domain kitab.contoh.id
  bash install.sh --check --domain kitab.contoh.id   Pemeriksaan tanpa perubahan

Didukung: Ubuntu 20.04+, Debian 12+, AlmaLinux/Rocky/RHEL 9+; x86_64/ARM64.
Port aplikasi dipilih otomatis di localhost. Database/unggahan disimpan terpisah.
HELP
}

parse_args() {
    while (($#)); do
        case "$1" in
            --domain) [[ $# -ge 2 ]] || die 'Nilai --domain belum diisi.'; DOMAIN="${2,,}"; shift 2 ;;
            --check) CHECK_ONLY=1; shift ;;
            --help|-h) usage; exit 0 ;;
            *) die "Pilihan tidak dikenal: $1" ;;
        esac
    done
}

valid_domain() {
    local name="$1" label
    [[ ${#name} -le 253 && "$name" == *.* && "$name" != *..* && "$name" != *. ]] || return 1
    local -a labels
    IFS=. read -r -a labels <<< "$name"
    for label in "${labels[@]}"; do
        [[ "$label" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || return 1
    done
}

check_distribution() {
    local distribution="$1" major="${2%%.*}"
    case "$distribution" in
        ubuntu) [[ "$major" -ge 20 ]] || die 'Gunakan Ubuntu 20.04 atau lebih baru.' ;;
        debian) [[ "$major" -ge 12 ]] || die 'Gunakan Debian 12 atau lebih baru.' ;;
        almalinux|rocky|rhel) [[ "$major" -ge 9 ]] || die 'Gunakan AlmaLinux/Rocky/RHEL 9 atau lebih baru.' ;;
        *) die 'Distribusi ini belum didukung installer otomatis.' ;;
    esac
}

check_host() {
    [[ "$(uname -s)" == Linux ]] || die 'Installer ini dijalankan di server Linux aaPanel, bukan komputer Windows.'
    [[ -r /etc/os-release ]] || die 'Sistem operasi tidak dapat dikenali.'
    # File sistem yang disediakan distribusi Linux.
    . /etc/os-release
    check_distribution "$ID" "$VERSION_ID"
    case "$(uname -m)" in x86_64|aarch64|arm64) ;; *) die 'Arsitektur CPU belum didukung.' ;; esac
    [[ -d /run/systemd/system ]] || die 'Server harus menggunakan systemd.'
    APACHECTL=/www/server/apache/bin/apachectl
    [[ -x "$APACHECTL" ]] || APACHECTL=/www/server/httpd/bin/apachectl
    [[ -x "$APACHECTL" ]] || die 'Apache aaPanel belum ditemukan. Pasang/aktifkan Apache di aaPanel terlebih dahulu.'
}

ask_domain() {
    if [[ -z "$DOMAIN" ]]; then
        read -r -p 'Domain aplikasi (contoh: kitab.domainanda.com): ' DOMAIN </dev/tty
        DOMAIN="${DOMAIN,,}"
    fi
    valid_domain "$DOMAIN" || die 'Domain tidak valid. Gunakan nama domain tanpa https://, port, atau path.'
}

check_apache() {
    VHOST="/www/server/panel/vhost/apache/$DOMAIN.conf"
    [[ -f "$VHOST" ]] || die "Buat website $DOMAIN di aaPanel terlebih dahulu, lalu ulangi perintah ini."
    grep -Eiq '^[[:space:]]*<VirtualHost[^>]*:443([[:space:]>])' "$VHOST" || die "Aktifkan SSL untuk $DOMAIN di aaPanel terlebih dahulu, lalu ulangi perintah ini."
    local modules
    modules="$("$APACHECTL" -M)" || die 'Konfigurasi Apache saat ini bermasalah. Periksa dari aaPanel.'
    local module
    for module in proxy_module proxy_http_module headers_module; do
        grep -Fq "$module" <<< "$modules" || die "Modul Apache $module belum aktif. Aktifkan modul tersebut melalui pengaturan Apache aaPanel."
    done
    if [[ -f "$SERVICE_FILE" ]] && ! grep -Fqx "WorkingDirectory=$APP_DIR" "$SERVICE_FILE"; then
        die 'Nama layanan kitab sudah dipakai aplikasi lain. Installer tidak mengubah layanan tersebut.'
    fi
}

prerequisites() {
    say '[1/7] Menyiapkan kebutuhan sistem…'
    if command -v apt-get >/dev/null; then
        apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates git tar xz-utils util-linux
    elif command -v dnf >/dev/null; then
        dnf install -y curl ca-certificates git tar xz util-linux shadow-utils libxcrypt-compat
    else
        die 'Pengelola paket sistem tidak didukung.'
    fi
    getent group kitab >/dev/null || groupadd --system kitab
    if id kitab >/dev/null 2>&1; then
        [[ "$(getent passwd kitab | cut -d: -f6)" == "$APP_DIR" ]] || die 'Akun sistem kitab dipakai instalasi lain; installer tidak mengambil alih akun tersebut.'
    else
        useradd --system --gid kitab --home-dir "$APP_DIR" --shell /usr/sbin/nologin kitab
    fi
    install -d -m 755 "$RUNTIME_DIR"
    install -d -m 700 -o kitab -g kitab "$DATA_DIR"
    TEMP_DIR="$(mktemp -d /tmp/kitab-install.XXXXXXXX)"
}

get_project() {
    say '[2/7] Menyiapkan kode aplikasi…'
    if [[ -d "$APP_DIR/.git" ]]; then
        local origin
        origin="$(git -c safe.directory="$APP_DIR" -C "$APP_DIR" remote get-url origin)"
        [[ "${origin%.git}" == "${REPOSITORY%.git}" ]] || die "$APP_DIR berisi repositori lain. Tidak ada berkas yang ditimpa."
        say 'Menggunakan kode yang sudah tersedia; perubahan lokal dan data dipertahankan.'
    elif [[ -e "$APP_DIR" ]]; then
        die "$APP_DIR sudah ada dan bukan repositori aplikasi. Tidak ada berkas yang ditimpa."
    else
        git clone --depth 1 --branch main "$REPOSITORY" "$APP_DIR"
    fi
    chown -R kitab:kitab "$APP_DIR"
    [[ -f "$APP_DIR/deploy/aapanel.py" ]] || die 'Kode installer dalam repositori belum lengkap. Perbarui kode proyek terlebih dahulu.'
    cd "$APP_DIR"
}

install_python() {
    say '[3/7] Menyiapkan Python khusus aplikasi…'
    export UV_PYTHON_INSTALL_DIR="$RUNTIME_DIR/python"
    export UV_PYTHON_BIN_DIR="$RUNTIME_DIR/python-bin"
    export UV_CACHE_DIR="$RUNTIME_DIR/cache"
    if [[ ! -x "$RUNTIME_DIR/uv/uv" ]]; then
        fetch https://astral.sh/uv/install.sh -o "$TEMP_DIR/uv-install.sh"
        UV_UNMANAGED_INSTALL="$RUNTIME_DIR/uv" sh "$TEMP_DIR/uv-install.sh"
    fi
    "$RUNTIME_DIR/uv/uv" python install 3.12
    if [[ ! -x "$APP_DIR/.venv/bin/python" ]]; then
        "$RUNTIME_DIR/uv/uv" venv --python 3.12 --seed "$APP_DIR/.venv"
    fi
    "$APP_DIR/.venv/bin/python" -m pip install -r "$APP_DIR/requirements.txt"
    chown -R kitab:kitab "$APP_DIR/.venv"
}

node_compatible() {
    [[ -x "$1" && -f "$(dirname "$1")/npm" ]] || return 1
    as_app "$1" -e 'process.exit([22,24].includes(Number(process.versions.node.split(".")[0]))?0:1)' 2>/dev/null
}

build_frontend() {
    say '[4/7] Menyiapkan Node.js dan membangun antarmuka…'
    local candidate='' node_exe='' arch line archive
    for candidate in "$(command -v node || true)" /www/server/nodejs/v{22,24}*/bin/node "$RUNTIME_DIR/node/bin/node"; do
        if node_compatible "$candidate"; then node_exe="$candidate"; break; fi
    done
    if [[ -z "$node_exe" ]]; then
        case "$(uname -m)" in x86_64) arch=x64 ;; *) arch=arm64 ;; esac
        fetch https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$TEMP_DIR/SHASUMS256.txt"
        line="$(grep -E "  node-v22\.[0-9]+\.[0-9]+-linux-$arch\.tar\.xz$" "$TEMP_DIR/SHASUMS256.txt")"
        [[ -n "$line" && "$(printf '%s\n' "$line" | wc -l)" -eq 1 ]] || die 'Paket Node.js resmi tidak dapat dikenali.'
        archive="${line##* }"
        fetch "https://nodejs.org/dist/latest-v22.x/$archive" -o "$TEMP_DIR/$archive"
        (cd "$TEMP_DIR" && printf '%s\n' "$line" | sha256sum -c -)
        install -d -m 755 "$RUNTIME_DIR/node"
        tar -xJf "$TEMP_DIR/$archive" -C "$RUNTIME_DIR/node" --strip-components=1
        node_exe="$RUNTIME_DIR/node/bin/node"
    fi
    local node_bin_dir
    node_bin_dir="$(dirname "$node_exe")"
    as_app env PATH="$node_bin_dir:$PATH" "$node_bin_dir/npm" ci
    as_app env PATH="$node_bin_dir:$PATH" "$node_bin_dir/npm" run build
    [[ -f "$APP_DIR/dist/index.html" && -f "$APP_DIR/dist/sw.js" ]] || die 'Build antarmuka belum lengkap.'
}

select_port() {
    local candidate listeners
    command -v ss >/dev/null || die 'Perintah ss belum tersedia. Pasang paket iproute2 lalu ulangi installer.'
    for candidate in {8000..8100}; do
        listeners="$(ss -lntH "( sport = :$candidate )")" || die 'Tidak dapat memeriksa port lokal server.'
        if [[ -z "$listeners" ]]; then
            APP_PORT="$candidate"
            say "Port lokal aplikasi: $APP_PORT"
            return
        fi
    done
    die 'Tidak ada port kosong dalam rentang 8000–8100.'
}

configure_service() {
    say '[5/7] Menyiapkan konfigurasi dan administrator…'
    if [[ ! -e "$ENV_FILE" ]]; then
        local secret
        secret="$("$APP_DIR/.venv/bin/python" -c 'import secrets; print(secrets.token_hex(32))')"
        (umask 077; printf 'DATA_DIR=%s\nSESSION_SECRET=%s\nCOOKIE_SECURE=true\nMAX_PDF_MB=100\nMAX_AUDIO_MB=200\nMAX_IMAGE_MB=10\n' "$DATA_DIR" "$secret" > "$ENV_FILE")
    else
        grep -Fxq "DATA_DIR=$DATA_DIR" "$ENV_FILE" || die "DATA_DIR pada $ENV_FILE berbeda. Konfigurasi lama dipertahankan; periksa lokasi data sebelum melanjutkan."
        if grep -Eq '^[[:space:]]*DATABASE_URL=' "$ENV_FILE"; then die 'Konfigurasi memakai DATABASE_URL khusus. Installer SQLite tidak mengubah atau memindahkan database tersebut.'; fi
        say 'Konfigurasi dan rahasia sesi yang sudah ada dipertahankan.'
    fi
    chmod 600 "$ENV_FILE"
    as_app env DATA_DIR="$DATA_DIR" "$APP_DIR/.venv/bin/python" -m backend.setup_admin --if-missing </dev/tty
    cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Aplikasi Kitab Digital
After=network.target

[Service]
User=kitab
Group=kitab
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$APP_DIR/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port $APP_PORT --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
SERVICE
    systemctl daemon-reload
    SERVICE_STARTED=1
    systemctl enable --now kitab
    local ready=0 attempt
    for attempt in {1..30}; do
        if systemctl is-active --quiet kitab && curl --silent --fail --max-time 3 "http://127.0.0.1:$APP_PORT/api/settings" >/dev/null; then ready=1; break; fi
        sleep 1
    done
    [[ "$ready" -eq 1 ]] || die 'Aplikasi belum dapat dijalankan. Periksa: journalctl -u kitab -n 50 --no-pager'
}

configure_apache() {
    say '[6/7] Memasang reverse proxy Apache dengan backup…'
    if command -v getenforce >/dev/null && [[ "$(getenforce)" == Enforcing ]]; then
        if ! getsebool httpd_can_network_connect | grep -q -- '--> on'; then
            setsebool -P httpd_can_network_connect on
            SELINUX_CHANGED=1
        fi
    fi
    "$APP_DIR/.venv/bin/python" -m deploy.aapanel --domain "$DOMAIN" --vhost "$VHOST" --apachectl "$APACHECTL" --port "$APP_PORT"
}

finish() {
    printf '%s\n' "$DOMAIN" > "$MARKER"
    chown kitab:kitab "$MARKER"
    say "[7/7] Instalasi selesai.

Aplikasi : https://$DOMAIN
Admin    : https://$DOMAIN/admin

Masuk memakai akun yang Anda buat tadi.
Data disimpan di $DATA_DIR. Port $APP_PORT tidak perlu dibuka ke internet.
Log bantuan: journalctl -u kitab -n 50 --no-pager"
}

cleanup() {
    local status=$?
    if [[ "$status" -ne 0 ]]; then
        if [[ "$SERVICE_STARTED" -eq 1 ]]; then systemctl stop kitab || true; fi
        if [[ "$SELINUX_CHANGED" -eq 1 ]]; then setsebool -P httpd_can_network_connect off || true; fi
        printf '\nInstalasi belum selesai. Akun, database, dan unggahan tidak dihapus. Perbaiki pesan galat di atas lalu jalankan ulang installer.\n' >&2
    fi
    if [[ "$TEMP_DIR" == /tmp/kitab-install.* && -d "$TEMP_DIR" ]]; then rm -rf -- "$TEMP_DIR"; fi
    return "$status"
}

main() {
    parse_args "$@"
    check_host
    ask_domain
    check_apache
    if [[ "$CHECK_ONLY" -eq 1 ]]; then say "Pemeriksaan awal berhasil untuk $DOMAIN. Tidak ada konfigurasi yang diubah."; return; fi
    check_root
    if systemctl is-active --quiet kitab; then
        if [[ -f "$MARKER" && "$(cat "$MARKER")" == "$DOMAIN" ]]; then
            say "Aplikasi sudah terpasang: https://$DOMAIN (admin: https://$DOMAIN/admin). Data dan konfigurasi tidak diubah."; return
        fi
        die 'Layanan kitab sudah aktif dari instalasi lain/belum selesai. Hentikan layanan tersebut sebelum melanjutkan agar tidak tertimpa.'
    fi
    select_port
    check_terminal
    trap cleanup EXIT
    prerequisites
    get_project
    install_python
    build_frontend
    configure_service
    configure_apache
    finish
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
