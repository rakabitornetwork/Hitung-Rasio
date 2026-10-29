<?php

namespace App\Http\Controllers;

use App\Http\Requests\CalculateTapChainRequest;
use App\Services\OpticalBudget\PowerRxCalculator;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Inertia\Response;

class PowerRxController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('PowerRx/Index', [
            'config' => [
                'rasio_il' => config('power_rx.rasio_il'),
                'odp_splitter_il' => config('power_rx.odp_splitter_il'),
                'allowed_odp_splitters' => config('power_rx.allowed_odp_splitters'),
                'odp_count' => config('power_rx.odp_count'),
                'max_nodes' => config('power_rx.max_nodes'),
                'defaults' => config('power_rx.defaults'),
                'thresholds' => config('power_rx.thresholds'),
            ],
        ]);
    }

    public function calculateNetwork(CalculateTapChainRequest $request, PowerRxCalculator $calculator): JsonResponse
    {
        $result = $calculator->calculateTapChain($request->chainInput());

        return response()->json([
            'result' => $result,
        ]);
    }
}
