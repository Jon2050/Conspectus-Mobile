<?php

declare(strict_types=1);

// Emits the app-shell headers when the hosting package does not provide Apache mod_headers.
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.1drv.com https://*.microsoftpersonalcontent.com; frame-src 'self' https://login.microsoftonline.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
header("X-Content-Type-Options: nosniff");
header("Referrer-Policy: strict-origin-when-cross-origin");
header("Content-Type: text/html; charset=utf-8");

readfile(__DIR__ . '/index.html');
