<?php

namespace App\Http\Controllers;

use App\Services\AppUpdate\GitUpdateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AppUpdateController extends Controller
{
    public function status(Request $request, GitUpdateService $updater): JsonResponse
    {
        if ($denied = $this->denyUnlessAuthorized($request)) {
            return $denied;
        }

        try {
            return response()->json([
                'status' => $updater->status(),
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
    }

    public function pull(Request $request, GitUpdateService $updater): JsonResponse
    {
        if ($denied = $this->denyUnlessAuthorized($request)) {
            return $denied;
        }

        try {
            $result = $updater->pull();

            return response()->json($result);
        } catch (RuntimeException $e) {
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        } catch (Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => 'Pembaruan gagal: '.$e->getMessage(),
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    private function denyUnlessAuthorized(Request $request): ?JsonResponse
    {
        if (! config('app_update.enabled')) {
            return response()->json([
                'message' => 'Pembaruan aplikasi dinonaktifkan.',
            ], Response::HTTP_FORBIDDEN);
        }

        $token = config('app_update.token');

        if (is_string($token) && $token !== '') {
            $provided = (string) $request->header('X-Update-Token', '');

            if (! hash_equals($token, $provided)) {
                return response()->json([
                    'message' => 'Token pembaruan tidak valid.',
                ], Response::HTTP_FORBIDDEN);
            }
        }

        return null;
    }
}
