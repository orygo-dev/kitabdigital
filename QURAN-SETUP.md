# Mengaktifkan menu Al-Qur’an

Menu **Al-Qur’an** berada tepat setelah **Beranda**. Pembaca menyediakan daftar surah, pencarian nama/nomor, filter Makkiyah/Madaniyah, teks Utsmani, terjemahan Indonesia, ukuran huruf, dan penanda ayat di perangkat. Halaman pembaca memiliki pemilih surah, lompat ke nomor ayat, dan navigasi surah sebelumnya/berikutnya. Ayat dimuat 50 per halaman. Daftar surah dan halaman ayat yang pernah berhasil dibuka disimpan di peramban sebagai cadangan saat sumber tidak dapat dijangkau; ini bukan unduhan seluruh Al-Qur’an. Audio tilawah Quran.Foundation belum termasuk pada tahap ini; menu Murotal yang sudah ada tetap tersedia.

Daftar surah mengikuti tampilan mushaf: kartu perkamen berbingkai emas, medali nomor surah, nama Arab yang menonjol, dan pita penanda pada surah yang disimpan. Panel **Lanjutkan bacaan** mengarah ke ayat terakhir yang ditandai. Pencarian nama/nomor dan filter Makkiyah/Madaniyah tetap tersedia.

Halaman surah menggunakan tampilan mushaf berbingkai emas dengan latar perkamen. Tombol **Tandai ayat** dapat ditekan kembali untuk menghapus penanda; ayat yang ditandai diberi sorotan dan pita penanda. Navigasi **Surah sebelumnya / Surah berikutnya** tersedia di atas dan di bawah bacaan, dengan nama surah tujuan. Pada surah pertama/terakhir, arah yang tidak tersedia dinonaktifkan. Di ponsel, buka **Pilih surah & ayat** untuk menampilkan pemilih surah dan lompat ayat.

## 1. Buat kredensial Quran.Foundation

Buka [Developer Console](https://dev-console.quran.foundation) dan buat aplikasi **Backend/server** dengan akses **Content APIs**. Gunakan Client Credentials dengan scope `content`. Kredensial pre-live dan production berbeda. Ikuti [panduan resmi](https://api-docs.quran.foundation/docs/quickstart/).

Jangan kirim Client Secret melalui chat, commit Git, atau masukkan ke kode frontend. Pengunjung tidak perlu login ke Quran.Foundation untuk membaca.

## 2. Konfigurasi server aaPanel

Setelah memperbarui kode dan membangun frontend, masuk SSH sebagai root:

```bash
nano /etc/kitab.env
```

Tambahkan baris berikut, isi dengan kredensial Anda sendiri:

```dotenv
QF_ENV=production
QF_CLIENT_ID=isi_client_id
QF_CLIENT_SECRET=isi_client_secret
```

Gunakan `QF_ENV=prelive` jika kredensial masih untuk pengujian pre-live. Jangan menghapus DATA_DIR, SESSION_SECRET, atau pengaturan lama. Aplikasi tidak membaca `.env` secara otomatis; layanan installer membaca `/etc/kitab.env` melalui systemd.

Simpan, lalu jalankan:

```bash
chmod 600 /etc/kitab.env
systemctl restart kitab
curl -fsS http://127.0.0.1:8001/api/quran/chapters
```

Ganti `8001` dengan port lokal aplikasi yang dipilih installer, jika berbeda. Lihat portnya dengan `systemctl cat kitab` pada baris `ExecStart`. Buka `/alquran` di domain aplikasi dan muat ulang halaman setelah pembaruan.

Tanpa kredensial, menu tetap terlihat dan menampilkan “Layanan Al-Qur’an belum diaktifkan oleh pengurus”, bukan data contoh. Jika koneksi/token gagal, pengunjung menerima pesan umum; kredensial dan respons autentikasi tidak dikirim ke browser.

## Terjemahan dan sumber

Jika muncul pesan layanan tidak dapat dihubungi, pastikan versi terbaru sudah terpasang dan `QF_ENV` sesuai dengan lingkungan kredensial. Integrasi mengirim `User-Agent: KitabDigital/1.0`; User-Agent bawaan Python urllib diblokir oleh Quran.Foundation dengan HTTP 403/1010 sesuai [panduan autentikasi](https://api-docs.quran.foundation/docs/quickstart/manual-authentication/).

Backend mengambil daftar `/resources/translations` dan memilih sumber berbahasa `indonesian` dengan ID terkecil agar pilihan konsisten. Nama sumber dan penulis ditampilkan di pembaca. Untuk menetapkan sumber tertentu, tambahkan `QF_TRANSLATION_ID=ID_SUMBER` di `/etc/kitab.env`; ID tersebut harus merupakan terjemahan Indonesia yang tersedia pada lingkungan API tersebut. Terjemahan tidak dihasilkan AI atau diterjemahkan ulang. Markup ditampilkan sebagai teks biasa, penanda catatan kaki disembunyikan, dan teks Arab dipertahankan dari `text_uthmani`. Halaman ditandai `translate="no"` untuk mencegah penerjemahan otomatis.

Token disimpan di memori server dan diperbarui sebelum kedaluwarsa. Respons konten di-cache satu jam, maksimal 256 permintaan berbeda per proses. Jika API mengembalikan 401, backend memperbarui token dan mencoba sekali lagi. Tidak ada database baru atau migrasi untuk fitur ini.

Integrasi mengikuti [Content API](https://api-docs.quran.foundation/docs/api-reference/). Pengujian lokal memakai respons tiruan untuk autentikasi, paging, cache, dan error; verifikasi terhadap akun Quran.Foundation Anda memerlukan kredensial aktif di server.
