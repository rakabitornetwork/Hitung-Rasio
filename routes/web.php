<?php

use App\Http\Controllers\AppUpdateController;
use App\Http\Controllers\PowerRxController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PowerRxController::class, 'index'])->name('power-rx.index');
Route::post('/power-rx/hitung-odp', [PowerRxController::class, 'calculateNetwork'])->name('power-rx.calculate-network');

Route::middleware('throttle:12,1')->group(function (): void {
    Route::get('/app/update/status', [AppUpdateController::class, 'status'])->name('app.update.status');
    Route::post('/app/update/pull', [AppUpdateController::class, 'pull'])->name('app.update.pull');
});
