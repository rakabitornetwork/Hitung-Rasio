# Aplikasi Perhitungan Rasio Splitter

Aplikasi web untuk menghitung **Power RX / redaman optik FTTH** berdasarkan rantai rasio splitter (tap/lanjut) dan splitter pasif 1:N, dengan kanvas drag-and-drop.

**by Teslatech**

| | |
|---|---|
| Stack | PHP 8.3+ / Laravel 13 · Inertia · React 19 · Vite 8 · Tailwind 4 |
| Repo | https://github.com/rakabitornetwork/Hitung-Rasio.git |
| UI | Bahasa Indonesia |

## Fitur utama

- Kanvas jalur optik: SFP → rasio / splitter 1:N / kartu gabungan (rasio + 1:N)
- Edit nilai langsung di kartu kanvas (daya SFP, tap %, rasio 1:N)
- Redaman jalur sebelum splitter (fiber, konektor, splice, margin) — bisa disembunyikan
- Hitung live di browser + hitung resmi lewat server
- Simpan / muat rantai sebagai file JSON
- Tombol **Update** untuk `git pull` dari GitHub (opsional di VPS)

---

## Persyaratan server (VPS)

- **PHP** ≥ 8.3 (disarankan 8.4) dengan ekstensi: `mbstring`, `openssl`, `pdo_sqlite` (atau `pdo_mysql`), `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo`
- **Composer** 2.x
- **Node.js** ≥ 20 (LTS) + npm
- **Git**
- Web server: **Nginx** atau **Apache** (document root harus mengarah ke folder `public/`)
- Akses tulis ke `storage/` dan `bootstrap/cache/`

---

## Instalasi pertama kali di VPS

### Perintah pertama (clone)

Dari direktori web Anda (contoh `/var/www/hitung` atau `~/public_html`):

```bash
git clone https://github.com/rakabitornetwork/Hitung-Rasio.git .
```

Jika folder belum kosong dan Anda ingin subfolder:

```bash
git clone https://github.com/rakabitornetwork/Hitung-Rasio.git hitung-rasio
cd hitung-rasio
```

### Setup otomatis (disarankan)

Setelah clone, jalankan satu rangkaian setup Composer (install dependensi PHP + `.env` + key + migrate + npm + build):

```bash
touch database/database.sqlite
composer run setup
```

Itu setara dengan:

1. `composer install`
2. Salin `.env.example` → `.env` (jika belum ada)
3. `php artisan key:generate`
4. `php artisan migrate --force`
5. `npm install --ignore-scripts`
6. `npm run build`

### Konfigurasi `.env` produksi

Edit `.env` setelah setup:

```bash
nano .env
```

Minimal yang perlu disesuaikan:

```env
APP_NAME="Power RX OLT"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://domain-anda.com

DB_CONNECTION=sqlite
# Atau MySQL:
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=hitung_rasio
# DB_USERNAME=...
# DB_PASSWORD=...

# Tombol Update di UI (opsional)
APP_UPDATE_ENABLED=true
APP_UPDATE_BRANCH=main
APP_UPDATE_TOKEN=
APP_UPDATE_RUN_BUILD=true
```

Lalu cache config (produksi):

```bash
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Izin folder

```bash
sudo chown -R www-data:www-data storage bootstrap/cache database
sudo chmod -R ug+rwx storage bootstrap/cache
chmod 664 database/database.sqlite
```

Sesuaikan user web server (`www-data`, `nginx`, `apache`, dll.) dengan VPS Anda.

### Document root web server

Arahkan virtual host ke **`…/public`**, bukan root repo.

Contoh Nginx:

```nginx
root /var/www/hitung/public;
index index.php;
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
location ~ \.php$ {
    include fastcgi_params;
    fastcgi_pass unix:/run/php/php8.4-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
}
```

Contoh Apache: `DocumentRoot` ke `public/` dan pastikan `AllowOverride All` + `mod_rewrite` aktif (ada `.htaccess`).

---

## Instalasi lokal (pengembangan)

```bash
git clone https://github.com/rakabitornetwork/Hitung-Rasio.git
cd Hitung-Rasio
touch database/database.sqlite
composer run setup
php artisan serve
```

Frontend hot-reload (opsional, terminal kedua):

```bash
npm run dev
# atau
composer run dev
```

Buka `http://127.0.0.1:8000`.

---

## Update aplikasi di VPS

### Via Git (CLI)

```bash
cd /path/ke/aplikasi
git pull origin main
composer install --no-dev --optimize-autoloader
npm ci --ignore-scripts
npm run build
php artisan migrate --force
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Via tombol Update di UI

Tombol **Update / Terbaru** memanggil `git fetch` + `git pull --ff-only`, lalu `optimize:clear` (dan opsional `npm run build` jika `APP_UPDATE_RUN_BUILD=true`).

Catatan:

- Working tree harus bersih (tanpa perubahan lokal yang bentrok), atau pull `--ff-only` bisa gagal.
- User PHP-FPM harus punya akses tulis ke folder aplikasi + `.git`, dan bisa mengakses GitHub tanpa prompt login.
- Default `APP_UPDATE_RUN_BUILD=false` karena PHP-FPM sering tidak punya Node/npm di PATH. Setelah pull, build manual: `npm run build`.
- Jika Node lewat nvm, set di `.env` misalnya:  
  `APP_UPDATE_PATH=/home/USER/.nvm/versions/node/v22.23.3/bin` lalu `APP_UPDATE_RUN_BUILD=true`.
- Untuk produksi publik, set `APP_UPDATE_ENABLED=false` atau isi `APP_UPDATE_TOKEN`.

#### Jika tombol Update gagal

1. Baca pesan error di bawah tombol (sering: perubahan lokal, npm tidak ditemukan, atau akses GitHub).
2. Cek dari SSH sebagai user yang sama dengan PHP-FPM bila memungkinkan:

```bash
cd /path/ke/aplikasi
git status
git fetch origin main
git pull --ff-only origin main
```

3. Jika error *local changes would be overwritten* pada `public/build/` (hasil `npm run build` lokal):

```bash
sudo -u teslatech -H bash -lc 'cd /home/teslatech/domains/rasio.teslatech.my.id/public_html && git checkout -- public/build && git clean -fd -- public/build && git pull --ff-only origin main && php artisan config:clear'
```

File lain yang berubah: commit, stash, atau `git checkout -- <file>` (hati-hati: menghapus perubahan lokal). Tombol Update UI otomatis membuang perubahan lokal di `public/build/` sebelum pull.
4. Error **dubious ownership** (sering saat `git` dijalankan sebagai `root` sementara folder milik user hosting):

```bash
# Lebih aman: jalankan git sebagai pemilik folder, bukan root
sudo -u teslatech -H git -C /home/teslatech/domains/rasio.teslatech.my.id/public_html pull --ff-only origin main

# Atau izinkan directory ini (untuk user yang menjalankan perintah)
git config --global --add safe.directory /home/teslatech/domains/rasio.teslatech.my.id/public_html

# Agar PHP-FPM juga aman (system-wide)
git config --system --add safe.directory /home/teslatech/domains/rasio.teslatech.my.id/public_html
```

Tombol Update di UI sudah memakai `git -c safe.directory=*`, jadi biasanya tidak kena error ini.
5. Pastikan kepemilikan folder untuk user web/hosting, contoh:

```bash
sudo chown -R teslatech:teslatech /home/teslatech/domains/rasio.teslatech.my.id/public_html
# sesuaikan user/group panel Anda (teslatech, www-data, dll.)
```

5. Matikan build otomatis jika npm bermasalah:

```env
APP_UPDATE_RUN_BUILD=false
```

lalu `php artisan config:clear`.

---

## Penggunaan singkat

1. Atur daya **SFP** di kartu kanvas (atau panel pengaturan).
2. Seret **Rasio + 1:N**, rasio, atau splitter ke kanvas.
3. Ubah tap % / 1:N langsung di kartu.
4. Opsional: isi **Redaman jalur** (fiber/konektor/splice).
5. Klik **Hitung** untuk hasil resmi server; **Simpan** / **Muat** untuk file JSON.

Model perhitungan mengikuti rantai ODP (tap → splitter 1:N → hasil; lanjut → ODP berikutnya). Detail rumus ada di skill/referensi proyek.

---

## Pengujian

```bash
php artisan test --compact
```

---

## Lisensi & kredit

Copyright © Teslatech. All rights reserved.

Aplikasi ini dibangun di atas [Laravel](https://laravel.com/).
