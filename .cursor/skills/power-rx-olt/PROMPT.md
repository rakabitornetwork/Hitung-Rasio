# Prompt agent — bangun aplikasi Power RX OLT

Salin blok di bawah ke chat Agent (baru atau lanjutan). Skill `power-rx-olt` harus aktif / dibaca sebelum coding.

---

```text
Bangun aplikasi perhitungan Power RX OLT menggunakan metode rasio splitter secara dinamis dan interaktif.

Ikuti skill project: .cursor/skills/power-rx-olt/SKILL.md dan reference.md.
Ikuti AGENTS.md / Laravel Boost. Jangan buat file dokumentasi ekstra.

## Stack
- Backend: PHP 8.4+, Laravel 13, Inertia Laravel
- Frontend: React 19, Inertia.js, Vite 8, Tailwind CSS 4
- UI icons: Lucide React

Jika Inertia + React belum terpasang di repo ini, install dan konfigurasi dulu hingga halaman Inertia Hello World jalan, baru lanjut fitur Power RX.

## Fitur wajib
1. Input P_tx OLT (dBm), panjang & atenuasi fiber, jumlah/loss konektor, jumlah/loss splice, other loss, design margin (opsional).
2. Cascade splitter dinamis:
   - tambah / hapus / ubah urutan tahap
   - rasio per tahap: 1:2, 1:4, 1:8, 1:16, 1:32, 1:64, 1:128
   - IL default dari tabel katalog; boleh override manual per tahap
3. Hitung live di UI (mirror rumus server) + hasil resmi dari service PHP:
   P_rx = P_tx − (fiber + connector + splice + splitter_cascade + other + margin)
4. Tampilkan breakdown loss, rasio efektif (perkalian tahap), P_rx (2 desimal), status ok/marginal/overload/fail menurut ambang Class B+ di config.
5. UI satu halaman, jelas untuk teknisi FTTH: form kiri / diagram cascade, hasil kanan (atau setara responsif). Bukan dashboard generik.

## Arsitektur
- App\Services\OpticalBudget\PowerRxCalculator (source of truth)
- config/power_rx.php untuk IL default & ambang
- resources/js/lib/powerRx.ts mirror rumus
- Inertia page + Form Request + unit/feature tests
- Angka tampil 2 desimal; jangan campur dBm/mW tanpa konversi eksplisit

## Selesai bila
- composer test hijau untuk kalkulator
- npm run build sukses
- Cascade 1:4 + 1:8 dengan contoh di reference.md menghasilkan P_rx ≈ −16.70 dBm
```
