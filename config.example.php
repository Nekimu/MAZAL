<?php
/**
 * ==============================================================================
 * MAZAL POS & ERP - CONFIGURACIÓN DE BASE DE DATOS LOCAL
 * ==============================================================================
 * INSTRUCCIONES DE USO:
 * 1. Copia este archivo como `config.php`:
 *      cp config.example.php config.php
 *
 * 2. Crea el usuario dedicado en MySQL / phpMyAdmin:
 *      CREATE USER 'mazal_app'@'localhost' IDENTIFIED BY 'TuPasswordSeguraAqui!2026';
 *      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, DROP, REFERENCES, LOCK TABLES ON `mazal_bd`.* TO 'mazal_app'@'localhost';
 *      FLUSH PRIVILEGES;
 *
 * 3. Modifica los valores de abajo en `config.php` (NUNCA subas `config.php` al repositorio).
 * ==============================================================================
 */

return [
    // Conexión MySQL Local
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_user' => 'mazal_app',
    'db_pass' => 'TuPasswordSeguraAqui!2026',
    'db_name' => 'mazal_bd',

    // Whitelist de orígenes CORS autorizados (Frontend local)
    'allowed_origins' => [
        'http://localhost',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:80',
        'http://127.0.0.1',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:80'
    ]
];
