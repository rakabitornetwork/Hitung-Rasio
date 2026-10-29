<?php

use App\Http\Controllers\PowerRxController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PowerRxController::class, 'index'])->name('power-rx.index');
Route::post('/power-rx/hitung-odp', [PowerRxController::class, 'calculateNetwork'])->name('power-rx.calculate-network');
