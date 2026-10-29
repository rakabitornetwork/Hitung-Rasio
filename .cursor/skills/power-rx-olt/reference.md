# Power RX — Referensi rumus & default

## Rumus inti

```
P_rx = P_tx − Total_Loss

Fiber_Loss      = attenuation_db_per_km × length_km
Connector_Loss  = connector_count × loss_db_each
Splice_Loss     = splice_count × loss_db_each
Splitter_Loss   = Σ stage_insertion_loss_db
Other_Loss      = other_loss_db
Design_Margin   = design_margin_db   # opsional; default 0

Total_Loss = Fiber + Connector + Splice + Splitter + Other + Design_Margin

effective_ratio = Π stage_ratio   # hanya tahap mode rasio; null jika ada tahap persen
```

## Mode tahap splitter

Setiap tahap cascade punya `mode`:

| Mode | Input | IL otomatis |
|------|-------|-------------|
| `ratio` | 1:2 … 1:128 | tabel katalog typical |
| `percent` | porsi port 1–99% | `10·log10(100/p) + excess_loss` |

- Default excess loss persen: **0.3 dB** (`config/power_rx.php` → `percent.default_excess_loss_db`)
- Override IL manual tetap boleh di kedua mode
- Jika ada ≥1 tahap persen, `effective_ratio = null` (tampilkan “Asimetris”)

Contoh 10% + excess 0.3 → IL = 10.00 + 0.3 = **10.30 dB**

## Simulasi 8 ODP sekaligus

Model UI yang dipakai pengguna (sederhana):

```
SFP (mis. 7 dBm)
  → [Passive splitter dan/atau Rasio splitter berurutan]
  → ODP-n (Power RX)
```

Contoh urutan:
- `SFP → pasif → rasio`
- `SFP → rasio → pasif → rasio`

- Tiap ODP punya cascade sendiri dari SFP yang sama
- `P_rx = SFP − Σ IL tahap − loss ekstra opsional`
- Endpoint: `POST /power-rx/hitung-odp` → `PowerRxCalculator::calculateNetwork`

## Kode warna kabel fisik (overlay UI)

Konvensi lapangan yang ditampilkan di overlay cascade:

| Warna | Makna |
|-------|--------|
| Putih | Input / COM |
| Merah | Port porsi terbesar |
| Biru | Port porsi terkecil |

Pada mode persen, UI menandai kabel mana yang dilalui perhitungan; klik merah/biru untuk memilih port.

## Tabel insertion loss splitter (default katalog)

Nilai **typical** (bukan ideal teoritis `10·log10(N)`). User boleh override per tahap.

| Rasio | Ideal (dB) | Default IL (dB) |
|-------|------------|-----------------|
| 1:2   | 3.01       | 3.5             |
| 1:4   | 6.02       | 7.0             |
| 1:8   | 9.03       | 10.5            |
| 1:16  | 12.04      | 13.5            |
| 1:32  | 15.05      | 17.0            |
| 1:64  | 18.06      | 20.5            |
| 1:128 | 21.07      | 23.5            |

Simpan di config agar mudah diubah:

```php
// config/power_rx.php
'splitter_il' => [
    2 => 3.5,
    4 => 7.0,
    8 => 10.5,
    16 => 13.5,
    32 => 17.0,
    64 => 20.5,
    128 => 23.5,
],
```

## Default parameter UI

| Parameter | Default | Catatan |
|-----------|---------|---------|
| P_tx OLT | 5.0 dBm | GPON Class B+ tipikal ~1.5–5 dBm; biarkan editable |
| Atenuasi | 0.35 dB/km | 1310 nm; sediakan preset 1490/1550 |
| Panjang fiber | 0 km | User isi |
| Loss konektor | 0.3 dB × jumlah | |
| Loss splice | 0.1 dB × jumlah | |
| Other loss | 0 dB | patchcord, WDM, dll. |
| Design margin | 0 dB | toggle “sertakan margin” |

## Ambang status ONT (GPON Class B+ tipikal)

| Status | Kondisi |
|--------|---------|
| `overload` | P_rx > max_rx (default −8 dBm) |
| `ok` | min_ok ≤ P_rx ≤ max_rx (default −25 … −8) |
| `marginal` | sensitivity ≤ P_rx < min_ok (default −28 … −25) |
| `fail` | P_rx < sensitivity (default −28 dBm) |

Semua ambang harus ada di config dan bisa diubah lewat UI advanced.

## Contoh cascade

**Kasus:** P_tx = 5 dBm, fiber 8 km @ 0.35 dB/km, 4 konektor @ 0.3, 2 splice @ 0.1, splitter 1:4 lalu 1:8, other 0, margin 0.

```
Fiber     = 8 × 0.35 = 2.80
Connector = 4 × 0.30 = 1.20
Splice    = 2 × 0.10 = 0.20
Splitter  = 7.0 + 10.5 = 17.50
Total     = 21.70 dB
P_rx      = 5.00 − 21.70 = −16.70 dBm
effective_ratio = 32
status    = ok   # jika window −25…−8
```

## Kasus uji unit (wajib)

1. Tanpa splitter: hanya fiber/konektor/splice.
2. Satu tahap 1:32 memakai IL default.
3. Cascade 1:4 + 1:8 → rasio efektif 32, IL = jumlah tahap.
4. Override IL manual pada satu tahap.
5. P_rx di bawah sensitivity → `fail`.
6. P_rx di atas max → `overload`.
7. Panjang/count negatif ditolak validator.
8. Tahap persen 10% + excess default → IL 10.30 dB, `effective_ratio` null.
9. Override IL pada tahap persen mengabaikan rumus otomatis.

## Preset atenuasi (opsional UI)

| Wavelength | dB/km |
|------------|-------|
| 1310 nm    | 0.35  |
| 1490 nm    | 0.25  |
| 1550 nm    | 0.21  |
