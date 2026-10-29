# Power RX — Referensi (model YapsiNET)

## Alur utama (rantai 8 ODP)

```
SFP (Input Power, mis. 7 dBm)
  → ODP1: Rasio tap%/lanjut% → Output tap / Output lanjut
       → Splitter ODP 1:N → Hasil Redaman
  → (Output lanjut jadi Input ODP2)
  → ODP2 … ODP8 (sama)
```

Contoh Excel:

| ODP | Rasio | Input | Hasil Redaman |
|-----|-------|-------|---------------|
| 1 | 4/96 | 7.00 | −17.23 |
| 2 | 4/96 | 6.57 | −17.66 |
| … | … | … | … |
| 8 | 8/92 | 3.63 | −17.59 |

Rumus per ODP:

```
IL_tap / IL_lanjut = tabel rasio_il[persen]
Output_tap = Input − IL_tap
Output_lanjut = Input − IL_lanjut
Hasil = Output_tap − odp_splitter_il[1:N]
Input_ODP_berikut = Output_lanjut
```

## Sel yang bisa diubah (UI)

- Input Power ODP 1 (SFP)
- Rasio tap % tiap ODP (lanjut = 100 − tap, otomatis)
- Splitter ODP 1:N (2/4/8/16/32/64)

## Endpoint

`POST /power-rx/hitung-odp` → `PowerRxCalculator::calculateTapChain`
