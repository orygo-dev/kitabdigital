# Murotal Quran.Foundation

Menu Murotal memiliki tab Murotal Al-Qur’an dan Audio Majelis. Audio unggahan, kategori, dan daftar putar majelis tetap tersedia di tab kedua. Tautan `/murotal?tab=majelis` membuka tab tersebut; tautan kategori lama juga tetap membuka koleksi majelis.

Tampilan pemutar memakai gradasi hijau dengan kartu judul surah sebagai pengganti foto, kontrol putar besar, serta kartu pilihan qari yang dapat dicari. Pada ponsel, panel pemutar ditampilkan lebih dahulu. Tautan Daftar surah dan Pilih qari memudahkan perpindahan bagian. Pemutar mini menampilkan nomor surah, judul, qari, navigasi, ulangi dan progres; ketuk judulnya untuk membuka panel pemutar. Penyorotan ayat otomatis belum diterapkan.

Integrasi menggunakan `QF_CLIENT_ID`, `QF_CLIENT_SECRET`, dan `QF_ENV` yang sama dengan menu Al-Qur’an. Tidak ada variabel baru atau migrasi database. Kredensial dan token hanya digunakan di server. Metadata memakai cache server satu jam. Aplikasi mengambil daftar qari dari `/resources/chapter_reciters` dan audio dari `/chapter_recitations/{reciter_id}` melalui Content API; ID qari ini berbeda dari ID audio per ayat.

MP3 diputar langsung melalui URL HTTPS CDN Quran.Foundation. Tidak perlu mengunggah MP3 ke server aplikasi. Ketersediaan surah mengikuti rekaman qari dan lingkungan API; surah tanpa rekaman diberi keterangan dan tombol nonaktif. Koneksi internet diperlukan. Fitur unduh/offline tidak diaktifkan untuk audio Quran.Foundation.

Pemutar yang sama dipakai kedua tab dan beranda, sehingga hanya ada satu audio aktif. Mendukung jeda, sebelumnya/selanjutnya, otomatis lanjut ke rekaman berikutnya sampai akhir antrean, ulangi satu rekaman, posisi pemutaran, dan volume. Antrean tetap berjalan saat navigasi dalam aplikasi, sedangkan memuat ulang halaman menghentikannya. Pilihan qari disimpan di perangkat. Perubahan qari tidak memotong rekaman aktif sampai pengguna memilih rekaman baru. Dukungan volume, Media Session, dan audio latar mengikuti peramban/OS.

Perbarui kode, jalankan `npm ci` dan `npm run build`, lalu restart layanan `kitab`. Diagnostik server tanpa menampilkan rahasia:

```bash
curl -sS http://127.0.0.1:8001/api/quran/reciters
curl -sS http://127.0.0.1:8001/api/quran/reciters/7/audio
```

Gunakan ID dari respons daftar qari untuk permintaan kedua. Jika API mengembalikan 503, periksa lingkungan serta akses Content API pada akun Quran.Foundation. Jika daftar tampil tetapi audio gagal, periksa koneksi peramban ke CDN dan coba tombol putar lagi.

Referensi: [daftar qari](https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/chapter-reciters/) dan [rekaman surah](https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/chapter-reciter-audio-files/).
