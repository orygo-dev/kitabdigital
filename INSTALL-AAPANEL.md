# Instalasi sederhana: aaPanel + Apache

## 1. Siapkan website di aaPanel

- Arahkan domain ke IP server.
- Buat website dengan domain tersebut di aaPanel, pilih website statis bila diminta. Tidak perlu membuat database MySQL.
- Aktifkan sertifikat SSL dan **Force HTTPS** untuk website itu.

## 2. Jalankan satu perintah

Masuk terminal SSH server sebagai **root**, lalu salin:

```bash
curl -fsSL https://raw.githubusercontent.com/orygo-dev/kitabdigital/main/install.sh -o /root/install-kitab.sh && bash /root/install-kitab.sh
```

Isi **domain yang sama dengan website aaPanel**, nama pengguna admin, dan kata sandi. Tunggu sampai muncul **Instalasi selesai**. Kata sandi tidak dicetak atau disimpan sebagai teks biasa.

Installer mengunduh proyek, memasang Python khusus aplikasi dan Node.js jika dibutuhkan, membangun frontend, membuat database, menyalakan layanan otomatis, lalu memasang reverse proxy Apache. Port lokal dipilih otomatis dari rentang 8000–8100; port yang sudah dipakai dilewati. Tidak perlu mengedit konfigurasi atau membuka port aplikasi ke internet.

## 3. Buka aplikasi

- Aplikasi: `https://domain-anda`
- Pengurus: `https://domain-anda/admin`

Login dengan akun yang baru Anda buat, kemudian unggah kitab dan audio.

## Persyaratan

Ubuntu 20.04+, Debian 12+, atau AlmaLinux/Rocky/RHEL 9+; CPU x86_64/ARM64; systemd; aaPanel dengan Apache. Python 3.12 dipasang terpisah sehingga tidak bergantung pada Python 3.8 bawaan Ubuntu 20.04. Jika Node.js yang tersedia tidak sesuai, installer memasang Node.js 22 khusus aplikasi. Dibutuhkan akses internet ke GitHub, Astral/Python, PyPI dan Node.js/npm untuk pengunduhan. Instalasi Apache khusus yang mematikan modul proxy/headers perlu mengaktifkan modul tersebut terlebih dahulu; installer menampilkan nama modul yang kurang. Apache yang digunakan panel tetap dipertahankan.

Pemeriksaan awal tanpa memasang atau mengubah konfigurasi:

```bash
bash /root/install-kitab.sh --check --domain kitab.domainanda.com
```

## Data dan pemasangan ulang

Kode di `/opt/kitab`, runtime terpisah di `/opt/kitab-runtime`, database/unggahan di `/var/lib/kitab`, dan konfigurasi rahasia di `/etc/kitab.env`. Backup konfigurasi Apache dibuat di `/var/backups/kitab`. Installer memeriksa sintaks Apache sebelum reload dan memulihkan konfigurasi jika perubahan gagal.

Jika proses terputus, jalankan lagi perintah instalasi. Akun, rahasia sesi, dan data yang sudah dibuat dipertahankan. Jika instalasi sudah selesai dan layanannya aktif, installer menampilkan alamat aplikasi tanpa memasang ulang. Installer memakai kode yang sudah tersedia di `/opt/kitab` dan tidak menjalankan `git pull` atau menimpa perubahan lokal secara otomatis; ini bukan perintah pembaruan aplikasi.

Apabila folder `/opt/kitab` atau nama layanan `kitab` dipakai proyek lain, installer berhenti tanpa mengambil alih proyek itu. Jika konfigurasi lama memakai lokasi data lain, installer juga berhenti agar tidak membuat database kosong di lokasi yang salah.

Melihat log aplikasi:

```bash
journalctl -u kitab -n 50 --no-pager
```

## Unggahan audio besar melalui Cloudflare

Aplikasi menerima MP3 hingga 200 MB secara bawaan. Jika domain memakai proxy Cloudflare Free/Pro, batas unggahan satu permintaan adalah 100 MB sehingga file seperti MP3 149 MB dapat ditolak sebelum mencapai aplikasi. Coba MP3 kecil untuk membedakan batas proxy dari masalah unggahan aplikasi. Untuk file di atas batas proxy, ubah record domain aplikasi di Cloudflare menjadi **DNS only** (awan abu-abu), lalu unggah kembali setelah perubahan DNS berlaku. Pastikan domain tetap mengarah ke server aaPanel dan SSL website aktif. Lihat [batas unggahan Cloudflare](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/).

## Status pengujian installer

48 uji otomatis lulus, mencakup kompatibilitas versi distribusi, validasi domain, konfigurasi HTTPS, backup/rollback Apache, urutan instalasi, penghentian saat gagal, serta pemeliharaan akun lama. Empat pemeriksaan tambahan lulus di Linux: sintaks Bash, penerimaan konfigurasi oleh Apache nyata, validasi unit systemd, dan kerahasiaan prompt kata sandi melalui `runuser`. Pemeriksaan tersebut memakai konfigurasi sementara dan tidak memasang atau me-reload layanan sistem mesin uji. Instalasi lengkap pada server aaPanel pengguna belum dijalankan; `--check` memeriksa prasyarat server sebelum pemasangan.

