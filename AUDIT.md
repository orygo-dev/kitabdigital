# Audit dan perbaikan MVP — 23 Oktober 2026

Audit dilakukan terhadap spesifikasi awal, kode, akses API, data tersimpan, dan alur browser. Perbaikan diterapkan langsung; konten dan akun produksi tidak diganti dengan data contoh.

## Temuan yang diperbaiki

| Area | Perbaikan |
| --- | --- |
| Pembaca dua halaman | Jendela render mengikuti pasangan halaman global. RTL/LTR, jumlah halaman ganjil, halaman terakhir, dan navigasi balik tidak melewatkan halaman. Halaman genap tetap dapat dipilih dan ditandai. |
| Progres dan render | State pembaca dipisah per kitab, progres dipulihkan dan dibatasi sesuai panjang PDF, penanda tidak valid dibersihkan. Batas resolusi dihitung dari ukuran masing-masing halaman agar PDF dengan ukuran campuran tidak membengkakkan canvas. |
| Offline | Salinan yang sudah diunduh tetap dipakai ketika offline walaupun PDF server telah diganti. Status unduhan memeriksa Cache Storage sebenarnya, sehingga cache yang terhapus tidak dianggap masih tersedia. Penolakan permintaan penyimpanan persisten tidak menggagalkan unduhan yang sudah berhasil. |
| Sesi admin | Logout dan login baru mencabut cookie sesi lama melalui hash token di database, termasuk untuk akses berkas privat. Kolom baru ditambahkan ke database lama tanpa menghapus akun. Satu akun memiliki satu sesi aktif. |
| Unggahan | Autentikasi/CSRF diperiksa sebelum parsing body. Batas ukuran berlaku juga pada transfer chunked. Folder berkas harus cocok dengan ekstensinya; format gambar harus sesuai dengan isi sebenarnya. |
| Validasi dan database | Batas nama kategori/playlist sesuai model, boolean tidak diterima sebagai durasi splash, foreign key SQLite diaktifkan, dan item playlist dihapus lebih dahulu sebelum induknya. Konflik integritas menghasilkan pesan 409 berbahasa Indonesia. |
| Panel pengurus | Respons permintaan lama tidak menimpa tab yang baru dibuka. Form pengaturan memuat nilai server terbaru setelah disimpan. Sesi kedaluwarsa kembali ke login. |
| Perpustakaan dan audio | Filter pencarian/kategori tidak terbawa dari Kitab ke Murotal. Memutar ulang dan tombol berikutnya pada playlist satu audio mengulang dari awal; progres/durasi galat dibersihkan saat berpindah rekaman. |
| Setup admin | Batas nama pengguna dan kata sandi disamakan dengan API login sehingga setup tidak membuat akun yang tidak dapat digunakan. |
| Lingkungan dan pengujian | Dependensi Python diuji dalam `.venv`, versi minimum runtime diperbarui, dan database pengujian selalu SQLite sementara meskipun `DATABASE_URL` produksi terpasang. Backend tidak gagal diimpor ketika output frontend belum lengkap. |
| PWA | Kegagalan menulis cache tidak membuang respons jaringan yang berhasil. Pemuatan logo tidak menahan respons pengaturan; pekerjaan cache tetap ditunggu service worker. Versi shell mencakup isi service worker. |

## Verifikasi

- `npm run build`: berhasil.
- `.venv\Scripts\python -m pytest -q`: **8 lulus**.
- `npx playwright test`: **2 alur lengkap lulus** (API/upload melalui panel, reader, fallback, audio persisten, branding/splash, dan regresi menyeluruh).
- `npx playwright test -g sentuhan`: **1 alur tambahan lulus**, ketuk tepi dan TouchEvent geser untuk RTL/LTR.
- `npm audit --json`: **0 kerentanan yang diketahui**.
- `pip-audit -r requirements.txt`: **0 kerentanan yang diketahui**.

Browser diuji dengan Chromium, viewport desktop 1280×1000 dan ponsel 390×844. PDF uji 12 dan 13 halaman diunggah sebagai berkas nyata, termasuk halaman dengan ukuran berbeda. MP3 valid diputar melalui HTML5 Audio. Uji regresi melintasi seluruh pasangan halaman desktop dan seluruh halaman tunggal ponsel untuk kedua arah baca, memeriksa maksimum delapan canvas yang dirender, perpindahan antar kitab, form pengaturan berulang, respons admin terlambat, cache terhapus, dan PDF server yang diperbarui.

Pengujian memakai direktori/database sementara. Penyiapan admin dan konten pengguna tetap dipertahankan. Setelah upgrade, administrator perlu login kembali. Ada peringatan deprecasi HTTPX dari TestClient Starlette; pengujian tetap lulus dan API produksi tidak menggunakan TestClient.

## Batas verifikasi

Hasil ini menunjukkan skenario yang diperiksa telah lulus, bukan jaminan tidak ada bug pada semua berkas/perangkat. Android/iOS fisik, Safari, perilaku audio saat OS menghentikan tab, serta deployment pada mesin Ubuntu belum diuji langsung. Pembatasan kuota dan penghapusan data oleh peramban tetap berlaku. Petunjuk deployment dan operasional tersedia di README.
