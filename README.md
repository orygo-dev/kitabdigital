# Kitab Majelis

Aplikasi kitab PDF dan audio majelis, tanpa registrasi pengguna. Satu proyek React/Vite/Tailwind dan FastAPI/SQLAlchemy/SQLite. Tidak menggunakan layanan berbayar, Docker, atau data koleksi contoh.

## Instalasi paling mudah: aaPanel + Apache

Buat website dan aktifkan SSL di aaPanel, lalu jalankan sebagai root melalui SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/orygo-dev/kitabdigital/main/install.sh -o /root/install-kitab.sh && bash /root/install-kitab.sh
```

Isi domain dan kredensial admin. Installer menangani dependensi, build, database, layanan otomatis, serta reverse proxy Apache. [Panduan singkat aaPanel](INSTALL-AAPANEL.md).

## Menjalankan secara lokal

Memerlukan Python 3.11+ dan Node.js 22 LTS.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm ci
npm run build
python -m backend.setup_admin
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Di Windows PowerShell, gunakan `.venv\Scripts\Activate.ps1` untuk aktivasi. Buka http://127.0.0.1:8000 dan http://127.0.0.1:8000/admin. Penyiapan admin meminta nama pengguna 1–100 karakter dan kata sandi 12–512 karakter secara interaktif, hanya saat belum ada admin. Tidak ada kata sandi bawaan. Jangan memasukkan kredensial produksi ke kode atau Git.

Untuk pengembangan, jalankan backend di port 8000 dan `npm run dev` di terminal lain. Vite meneruskan `/api` ke backend. Service worker diaktifkan pada build produksi, bukan mode pengembangan.

## Penggunaan

1. Masuk `/admin`, buat kategori kitab/audio sesuai kebutuhan.
2. Tambah kitab, unggah PDF asli serta sampul PNG/JPEG/WebP, atur arah baca, urutan, publikasi, unduhan dan pilihan beranda. Simpan formulir setelah unggahan selesai.
3. Tambah audio MP3. Buat daftar putar, pilih audio lalu atur urutannya. Qari/pelantun disimpan dalam kolom metadata `author`.
4. Ubah identitas, logo, warna, sambutan, dan layar pembuka di **Tampilan & beranda**. Perubahan diterapkan tanpa build ulang; halaman yang sedang terbuka mendapatnya ketika dimuat ulang. Layar pembuka tampil sekali pada peluncuran halaman, bukan setiap navigasi.
5. Pengguna dapat mencari/filter koleksi, membaca PDF, membalik halaman, memilih mode standar, menandai halaman dan menyimpan progres. Desktop menampilkan dua halaman, ponsel satu halaman. Memperbesar mengaktifkan mode standar agar halaman tetap bisa digulir.
6. **Simpan offline** menyimpan PDF yang diizinkan di Cache Storage. Status unduhan ditampilkan pada kartu. Muat ulang aplikasi setelah service worker pertama kali aktif bila diperlukan. Audio diunduh sebagai berkas melalui tombol **Unduh**; tidak otomatis disimpan untuk streaming offline.

Unggahan disimpan di `data/uploads/{books,audio,images}`; SQLite di `data/app.db`. Berkas lama tidak langsung dihapus saat konten diubah/dihapus agar referensi bersama aman. Administrator dapat mengarsipkan berkas yang sudah tidak direferensikan secara manual setelah backup. Adapter penyimpanan terpusat ada di `backend/storage.py`; R2 belum diintegrasikan. Mengganti penyimpanan objek memerlukan adapter dan respons berkas yang sesuai, bukan sekadar mengganti variabel lingkungan.

## Konfigurasi

| Variabel | Bawaan | Kegunaan |
| --- | --- | --- |
| `DATA_DIR` | `data` | Direktori data privat, sebaiknya path absolut di produksi |
| `DATABASE_URL` | SQLite di DATA_DIR | URL SQLAlchemy; driver PostgreSQL dan migrasi skema perlu disiapkan ketika bermigrasi |
| `SESSION_SECRET` | Kunci acak di DATA_DIR/session.key | Rahasia penandatangan sesi; gunakan nilai acak minimal 32 byte di produksi |
| `COOKIE_SECURE` | `false` | Wajib `true` saat memakai HTTPS produksi |
| `MAX_PDF_MB` | `100` | Batas setiap unggahan PDF |
| `MAX_AUDIO_MB` | `200` | Batas setiap unggahan MP3 |
| `MAX_IMAGE_MB` | `10` | Batas setiap unggahan gambar |

Model awal dibuat otomatis saat backend dijalankan. Skema menggunakan model relasional SQLAlchemy dan referensi foreign key yang juga diaktifkan pada SQLite. Upgrade MVP ini menambahkan kolom pencabutan sesi ke tabel administrator lama secara otomatis, tanpa menghapus akun atau konten. Migrasi ini membatalkan sesi lama sehingga pengurus perlu masuk kembali. Perubahan skema lain berikutnya tetap memerlukan migrasi; `create_all` tidak mengubah tabel lama. Backup seluruh direktori data serta konfigurasi rahasia, dengan menghentikan layanan dahulu agar salinan SQLite konsisten.

Satu akun administrator memiliki satu sesi aktif. Login baru mencabut sesi sebelumnya; logout mencabut cookie sesi yang pernah disalin. Token sesi acak disimpan sebagai hash di database dan diperiksa juga saat mengakses berkas privat. Autentikasi dan CSRF diperiksa sebelum body unggahan diproses; batas ukuran juga berlaku untuk transfer chunked.

## Deployment Ubuntu native

Contoh Ubuntu 24.04, Node.js 22 terpasang, direktori proyek `/opt/kitab`, akun layanan `kitab`. Jalankan proses Node hanya untuk build; aplikasi produksi dilayani oleh FastAPI di belakang Nginx.

```bash
sudo apt update
sudo apt install python3-venv python3-pip nginx
sudo useradd --system --home /opt/kitab --shell /usr/sbin/nologin kitab
# Salin proyek ke /opt/kitab terlebih dahulu.
sudo chown -R kitab:kitab /opt/kitab
sudo -u kitab python3 -m venv /opt/kitab/.venv
sudo -u kitab /opt/kitab/.venv/bin/pip install -r /opt/kitab/requirements.txt
cd /opt/kitab
sudo -u kitab npm ci
sudo -u kitab npm run build
sudo install -d -m 700 -o kitab -g kitab /var/lib/kitab
sudo -u kitab env DATA_DIR=/var/lib/kitab /opt/kitab/.venv/bin/python -m backend.setup_admin
```

Buat `/etc/kitab.env` (root, izin `600`) dengan nilai rahasia baru; hasil `python3 -c 'import secrets; print(secrets.token_hex(32))'` dapat digunakan untuk SESSION_SECRET:

```ini
DATA_DIR=/var/lib/kitab
SESSION_SECRET=GANTI_DENGAN_RAHASIA_ACAK_BARU
COOKIE_SECURE=true
MAX_PDF_MB=100
MAX_AUDIO_MB=200
MAX_IMAGE_MB=10
```

Buat `/etc/systemd/system/kitab.service`:

```ini
[Unit]
Description=Aplikasi Kitab Majelis
After=network.target

[Service]
User=kitab
Group=kitab
WorkingDirectory=/opt/kitab
EnvironmentFile=/etc/kitab.env
ExecStart=/opt/kitab/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/kitab

[Install]
WantedBy=multi-user.target
```

Gunakan satu worker untuk pembatasan percobaan login dalam memori. Untuk skala lebih besar, pindahkan pembatasan ke reverse proxy/shared storage sebelum menambah worker.

Konfigurasi Nginx `/etc/nginx/sites-available/kitab` (ganti domain):

```nginx
server {
    listen 80;
    server_name kitab.example.org;
    client_max_body_size 205m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kitab /etc/nginx/sites-enabled/kitab
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now kitab
sudo systemctl reload nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d kitab.example.org
```

Aktifkan HTTPS sebelum login produksi: cookie aman dan PWA memerlukannya (localhost diperbolehkan untuk pengembangan). Jangan mengekspos direktori data sebagai static root Nginx. Semua akses berkas harus melewati endpoint yang memeriksa publikasi dan izin unduhan. Menonaktifkan unduhan menyembunyikan fasilitas unduh, bukan DRM: peramban tetap membutuhkan byte PDF/audio untuk membaca/memutar, dan salinan offline yang sudah disimpan tidak bisa dicabut dari jauh.

## API

Dokumentasi interaktif tersedia di `/docs`. Endpoint publik: `/api/settings`, `/api/home`, `/api/public/{books,audio,book-categories,audio-categories,playlists}`, `/api/files/{jenis}/{nama}`, dan `/api/manifest.webmanifest`. Endpoint admin memakai sesi cookie HttpOnly dan token `X-CSRF-Token` yang diberikan `/api/auth/login` atau `/api/auth/session`.

CRUD admin: `/api/admin/{jenis}` (GET/POST), `/api/admin/{jenis}/{id}` (PUT/DELETE). Dashboard `/api/admin/dashboard`; pengaturan PUT `/api/admin/settings`; unggahan multipart POST `/api/admin/uploads/{books,audio,images}` dengan field `file`. Kategori yang masih dipakai tidak dapat dihapus. PDF terenkripsi, berkas rusak, format yang tidak cocok, dan unggahan melebihi batas ditolak.

## Pengujian

```bash
pip install -r requirements-dev.txt
npm ci
npx playwright install chromium
python -m pytest -q
npm run build
npx playwright test
```

Pengujian membuat PDF 12 dan 13 halaman (termasuk ukuran halaman berbeda), PNG, dan MP3 valid sendiri, lalu memakai direktori database sementara; tidak menanamkan data atau admin uji ke aplikasi produksi. Uji API mencakup autentikasi/CSRF, pencabutan sesi, migrasi database lama, unggah biasa/chunked, publikasi, pembatasan berkas, kategori aman, foreign key, playlist, branding dan splash. Uji browser memeriksa seluruh pasangan halaman RTL/LTR desktop dan halaman tunggal pada viewport ponsel, mode standar/fallback, progres/penanda, audio persisten, filter, pergantian tab admin saat permintaan terlambat, penyimpanan pengaturan berulang, branding, splash, PDF offline setelah berkas server diganti, dan status unduhan setelah cache dihapus.

Playwright memakai Python dari `.venv` bila tersedia. Gunakan `KITAB_PYTHON` untuk memilih interpreter lain. PDF yang telah disimpan tetap memakai salinan lokal ketika offline, walaupun pengurus telah mengunggah versi baru. Saat online, simpan lagi untuk memperbarui salinan tersebut. Status “Tersimpan offline” memeriksa cache sebenarnya, bukan hanya catatan metadata.

## Batas peramban

Penyimpanan offline mengikuti kuota dan kebijakan penghapusan peramban. Mode privat dapat menolak penyimpanan. Background audio dan Media Session mengikuti dukungan OS/peramban; tidak ada jaminan audio terus berjalan jika OS menutup tab. Fullscreen dapat tidak tersedia di sebagian perangkat. Safari/iOS dan perangkat Android fisik perlu uji penerimaan sebelum peluncuran. Animasi yang gagal beralih ke mode standar. Pembaca memelihara maksimum delapan halaman aktif dan cache dua belas canvas, bukan seluruh PDF.
