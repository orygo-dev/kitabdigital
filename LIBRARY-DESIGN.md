# Tampilan daftar kitab

Halaman `/kitab` memakai tema perkamen, hijau zamrud, dan emas yang serasi dengan beranda serta Al-Qur’an. Sampul unggahan tetap digunakan; kitab tanpa sampul mendapat ilustrasi sampul dengan judul aslinya.

Pencarian mencakup judul dan penulis. Filter kategori mendukung tautan `?kategori=ID`. Bagian lanjut membaca memakai progres lokal terbaru. Jumlah kitab, kategori, dan tanda pilihan majelis mengikuti data pengurus.

Tombol simpan offline hanya muncul untuk kitab yang diizinkan diunduh. Status tersimpan memeriksa cache berkas. Tampilan menyesuaikan desktop, tablet, dan ponsel hingga lebar 320 piksel.

Perubahan ini membutuhkan build ulang frontend (`npm ci` lalu `npm run build`), tanpa migrasi database atau pengaturan baru.

Pengujian browser terdapat di `tests/browser/book-library.spec.js`: pencarian dan filter, kelanjutan bacaan, penyimpanan offline dan izin unduhan, tampilan ponsel, serta koleksi kosong.
