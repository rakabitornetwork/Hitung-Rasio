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
    | Di banyak VPS, PHP-FPM tidak punya Node di PATH — biarkan false
    | kecuali npm tersedia untuk user web server, atau set APP_UPDATE_PATH.
    */
    'run_build' => (bool) env('APP_UPDATE_RUN_BUILD', false),

    /*
    | Prepend ke PATH proses git/npm (pisahkan dengan :).
    | Contoh: /home/user/.nvm/versions/node/v22.23.3/bin:/usr/local/bin
    */
    'path_prepend' => env('APP_UPDATE_PATH'),

    /*
    | HOME untuk proses git (credential / safe.directory).
    */
    'home' => env('APP_UPDATE_HOME'),

];
