<?php

return [

    'enabled' => (bool) env('APP_UPDATE_ENABLED', true),

    'remote' => env('APP_UPDATE_REMOTE', 'origin'),

    'branch' => env('APP_UPDATE_BRANCH', 'main'),

    /*
    | Optional shared secret. If set, requests must send header X-Update-Token.
    */
    'token' => env('APP_UPDATE_TOKEN'),

    /*
    | Run `npm run build` after a successful pull.
    */
    'run_build' => (bool) env('APP_UPDATE_RUN_BUILD', true),

];
