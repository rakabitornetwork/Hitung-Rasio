---
name: power-rx-olt
description: >-
  Builds and extends a dynamic Power RX OLT optical budget calculator using
  cascading splitter ratios (FTTH/GPON). Use when the user mentions Power RX,
  OLT power budget, rasio splitter, optical loss, ONT receive power, or asks to
  create/extend the Power RX calculator on Laravel + Inertia + React.
disable-model-invocation: false
---

# Power RX OLT Calculator

Bangun atau kembangkan aplikasi perhitungan **Power RX** dari OLT ke ONT dengan **splitter cascade dinamis & interaktif**.

## Stack wajib

| Layer | Versi / pilihan |
|-------|-----------------|
| Backend | PHP 8.4+, Laravel 13 |
| Bridge | Inertia Laravel |
| Frontend | React 19, Inertia.js, Vite 8, Tailwind CSS 4 |
| Icons | Lucide React |

Sebelum coding: baca `AGENTS.md`, aktifkan skill Laravel Boost yang relevan (`laravel-best-practices`, `tailwindcss-development`, `testing-best-practices`), dan `search-docs` untuk Inertia/React bila API belum pasti.

Jika Inertia + React belum terpasang di repo skeleton, install dulu (`laravel/react-starter-kit` atau setup manual Inertia + React + Tailwind 4 + Lucide) sebelum fitur kalkulator.

## Domain ringkas

```
P_rx (dBm) = P_tx (dBm) − Total_Loss (dB)

Total_Loss =
  Fiber_Loss
  + Connector_Loss
  + Splice_Loss
  + Splitter_Loss (jumlah IL tiap tahap cascade)
  + Other_Loss
  (+ Design_Margin opsional, default 0 kecuali user mengaktifkan)
```

- **Fiber_Loss** = `attenuation_db_per_km × length_km`
- **Splitter_Loss** = Σ insertion loss tiap tahap (mode `ratio` katalog ATAU mode `percent` rumus `10·log10(100/p)+excess`)
- Rasio efektif = perkalian tahap `ratio`; `null`/asimetris jika ada tahap persen
- Status ONT vs ambang: `ok` | `marginal` | `overload` | `fail` (lihat [reference.md](reference.md))

Detail tabel IL, default parameter, dan contoh cascade: baca [reference.md](reference.md) sebelum implementasi engine.

## Arsitektur yang diharapkan

```
OLT (P_tx)
  → jalur bersama (fiber + konektor + splice + cascade bersama)
  → ODP-1 … ODP-8
       → fiber/konektor/splice cabang
       → cascade cabang (campur ratio 1:N + percent pasif)
       → P_rx per ODP + status
```

Simulasi utama: **8 ODP sekaligus** via `calculateNetwork` / UI tab ODP + tabel hasil.

### Backend (source of truth)

- Service murni, mis. `App\Services\OpticalBudget\PowerRxCalculator`
- Input/output DTO atau array shape terdokumentasi (PHPDoc)
- Endpoint Inertia page + opsional `POST` JSON untuk validasi server-side
- Validasi Form Request: rasio di whitelist, panjang ≥ 0, P_tx realistis
- Unit test PHPUnit untuk rumus cascade (lihat contoh di reference)

### Frontend (interaktif)

- Satu halaman utama Inertia React, mis. `resources/js/Pages/PowerRx/Index.tsx`
- State lokal untuk edit cepat; hitung ulang **live** di client (mirror rumus server)
- Saat submit/simpan/export: kirim ke server untuk hasil resmi
- UI dinamis:
  - tambah / hapus / urutkan tahap splitter
  - pilih rasio per tahap (`1:2` … `1:128`) + override IL manual opsional
  - input P_tx, atenuasi, panjang per segmen, konektor, splice, other loss, margin
  - panel hasil: P_rx, total loss, breakdown per komponen, rasio efektif, status badge
- Icon Lucide: `Zap`, `GitBranch`, `Plus`, `Trash2`, `Cable`, `Antenna`, dll.
- Tailwind 4: variabel CSS jelas; hindari tema ungu generik / dark-mode by default kecuali diminta

Jangan duplikasi rumus di banyak file — ekstrak modul TS bersama, mis. `resources/js/lib/powerRx.ts`, yang mencerminkan service PHP.

## Workflow implementasi

Salin checklist ini dan centang saat mengerjakan:

```
Progress:
- [ ] 1. Pastikan stack Inertia + React 19 + Vite 8 + Tailwind 4 + Lucide siap
- [ ] 2. Config default loss/threshold (config/power_rx.php atau constants)
- [ ] 3. PowerRxCalculator + unit tests
- [ ] 4. Form Request + Controller Inertia
- [ ] 5. Modul TS mirror + komponen UI cascade
- [ ] 6. Halaman interaktif + breakdown hasil
- [ ] 7. Feature test HTTP / Inertia
- [ ] 8. npm run build / composer test hijau
```

### Aturan coding

- Pakai `php artisan make:* --no-interaction`
- Jangan ubah dependency di luar stack yang disetujui tanpa konfirmasi user
- Jangan buat file markdown dokumentasi tambahan kecuali user minta
- Ikuti konvensi sibling file di repo
- Semua angka optik tampilkan 2 desimal dBm/dB; simpan perhitungan full float

## Kontrak data (minimal)

```ts
type SplitterStage = {
  id: string
  mode: 'ratio' | 'percent'
  ratio: 2 | 4 | 8 | 16 | 32 | 64 | 128
  percent: number // 1–99, dipakai bila mode percent
  excessLossDb: number
  insertionLossDb: number | null // null = katalog / rumus persen
}

type PowerRxInput = {
  txPowerDbm: number
  fiber: { lengthKm: number; attenuationDbPerKm: number }
  connectors: { count: number; lossDbEach: number }
  splices: { count: number; lossDbEach: number }
  otherLossDb: number
  designMarginDb: number
  stages: SplitterStage[]
}

type PowerRxResult = {
  totalLossDb: number
  rxPowerDbm: number
  effectiveRatio: number
  breakdown: Record<string, number>
  status: 'ok' | 'marginal' | 'overload' | 'fail'
}
```

## Prompt siap pakai

Untuk memulai build dari chat baru, gunakan teks di [PROMPT.md](PROMPT.md) secara verbatim (atau tempel ke user query).

## Jangan

- Soft-fail diam-diam pada cascade kosong — izinkan 0 tahap (hanya fiber/konektor/splice)
- Mengunci UI ke satu rasio tetap; cascade harus dinamis
- Mencampur logika dBm dengan mW tanpa konversi eksplisit (`mW = 10^(dBm/10)`)
- Menyimpan secret / kredensial OLT nyata di repo
