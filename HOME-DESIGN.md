# Beranda ruang baca majelis

Beranda memakai sambutan zamrud dengan ilustrasi buku dan lentera, kartu akses Al-Qur’an/Kitab/Murotal, serta panel perkamen untuk kitab dan lantunan pilihan. Seluruh tautan dan tombol pemutar terhubung ke fungsi aplikasi.

- Nama majelis, teks sambutan, dan deskripsi tetap mengikuti pengaturan **Tampilan & beranda** di panel pengurus.
- **Kitab pilihan** menampilkan hingga tiga kitab terbit yang ditandai **Tampilkan di beranda**. Kartu memakai sampul unggahan; jika belum ada sampul, aplikasi membuat tampilan jilid dengan judul kitab itu sendiri. Tidak ada kitab contoh yang dimasukkan ke database. Tombol simpan offline tetap tersedia pada halaman perpustakaan.
- **Lantunan pilihan** menampilkan hingga tiga audio pilihan. Jika belum ada yang ditandai, digunakan audio terbaru dari koleksi yang terbit. Pemutar yang digunakan sama dengan halaman Murotal sehingga audio tetap berjalan saat pindah halaman.
- Panel **Lanjutkan bacaan** hanya muncul jika perangkat memiliki penanda ayat yang valid. Bagian kelanjutan baca kitab dan tautan kategori tetap tersedia ketika ada datanya.
- Koleksi kosong ditampilkan sebagai keadaan kosong yang informatif, bukan isi contoh.

Ilustrasi dekoratif dibuat dengan built-in **imagegen** dan disimpan di [`src/assets/home-welcome.png`](src/assets/home-welcome.png). [Prompt dan catatan aset](src/assets/HOME-ART.md). Teks pada gambar bukan sumber konten aplikasi; sampul ilustrasi hanya memuat ornamen geometris.

Untuk menerapkan pembaruan, ambil kode terbaru dan jalankan `npm ci` serta `npm run build`, kemudian restart layanan `kitab`. Tidak ada migrasi database atau perubahan kredensial Quran.Foundation. Aset ilustrasi ikut build dan cache aplikasi untuk dukungan offline.
