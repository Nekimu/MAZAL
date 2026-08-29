<?php
/**
 * ==============================================================================
 * MAZAL POS & ERP - BACKEND API MYSQL / APACHE (XAMPP LOCALHOST)
 * ==============================================================================
 * Maneja el almacenamiento local, contingencia offline y sincronización en MySQL.
 * Soporta todas las operaciones CRUD para:
 * - Productos y Precios (Multitarifa)
 * - Clientes y Créditos
 * - Proveedores y Cuentas por Pagar
 * - Ventas e Historial de Tickets
 * - Movimientos de Inventario (Kárdex)
 * - Sesiones de Caja
 * - Gastos de Caja
 * - Órdenes de Compra / Suministro
 * - Usuarios, Autenticación y Matriz de Permisos
 * - Estado Global (mazal_app_state)
 * ==============================================================================
 */

// Headers CORS para permitir peticiones desde cualquier origen local y Vite Dev Server
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Manejo de preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuración de Servidor MySQL (XAMPP por defecto)
$servername = "localhost";
$username   = "root";
$password   = "";

// Detección de Entrada JSON o Form Data
$rawInput = file_get_contents('php://input');
$postData = json_decode($rawInput, true) ?: [];

// Detección de Sucursal y Ruteo de Base de Datos
$branch = isset($_GET['branch']) ? trim($_GET['branch']) : (isset($_POST['branch']) ? trim($_POST['branch']) : (isset($postData['branch']) ? trim($postData['branch']) : 'Norte'));
if (empty($branch)) {
    $branch = 'Norte';
}

// Mapa de Sucursal a Base de Datos MySQL
$branchDbMap = [
    'MAZAL 1' => 'mazal_bd',   // Sucursal Norte / Principal
    'mazal 1' => 'mazal_bd',
    'Norte'   => 'mazal_bd',
    'Matriz'  => 'mazal_bd',
    'Centro'  => 'mazal_bd',
    'Bodega'  => 'mazal_bd',
    'MAZAL 2' => 'mazal_bd1',  // Sucursal Sur / Secundaria
    'mazal 2' => 'mazal_bd1',
    'Sur'     => 'mazal_bd1',
];

$requestedDb = isset($_GET['db']) ? trim($_GET['db']) : (isset($_POST['db']) ? trim($_POST['db']) : (isset($postData['db']) ? trim($postData['db']) : null));

if ($requestedDb && in_array($requestedDb, ['mazal_bd', 'mazal_bd1'])) {
    $dbname = $requestedDb;
} else {
    $dbname = isset($branchDbMap[$branch]) ? $branchDbMap[$branch] : 'mazal_bd';
}

// Conexión y Auto-Aprovisionamiento de Base de Datos
$rawMysqli = @new mysqli($servername, $username, $password);

if ($rawMysqli && !$rawMysqli->connect_errno) {
    // Crear bases de datos automáticamente si no existen
    $rawMysqli->query("CREATE DATABASE IF NOT EXISTS mazal_bd CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
    $rawMysqli->query("CREATE DATABASE IF NOT EXISTS mazal_bd1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
}

$mysqli = @new mysqli($servername, $username, $password, $dbname);

if ($mysqli->connect_errno) {
    if ($dbname !== 'mazal_bd') {
        $dbname = 'mazal_bd';
        $mysqli = @new mysqli($servername, $username, $password, $dbname);
    }
}

if ($mysqli->connect_errno) {
    echo json_encode([
        "success" => false,
        "error" => "Error al conectar con MySQL ({$dbname}): " . $mysqli->connect_error,
        "branch" => $branch,
        "database" => $dbname,
        "online" => false
    ]);
    exit;
}

$mysqli->set_charset("utf8mb4");

// 2. FUNCIÓN DE AUTO-PROVISIÓN Y AUTO-MIGRACIÓN DE ESQUEMA (SELF-HEALING SCHEMA)
function autoMigrateSchema($db, $targetDb) {
    $ensureColumns = function($tableName, $columns) use ($db) {
        $res = $db->query("SHOW COLUMNS FROM {$tableName}");
        $existingCols = [];
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $existingCols[strtolower($row['Field'])] = true;
            }
        }
        foreach ($columns as $colName => $colDef) {
            if (!isset($existingCols[strtolower($colName)])) {
                $db->query("ALTER TABLE {$tableName} ADD COLUMN {$colName} {$colDef};");
            }
        }
    };

    // A. TABLA USUARIOS
    $db->query("CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(100) NOT NULL UNIQUE,
        nombrecompleto VARCHAR(255) DEFAULT '',
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(50) DEFAULT 'vendedor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('usuarios', [
        'nombrecompleto' => "VARCHAR(255) DEFAULT ''",
        'password' => "VARCHAR(255) NOT NULL",
        'rol' => "VARCHAR(50) DEFAULT 'vendedor'",
        'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ]);

    // B. TABLA PRODUCTOS
    $db->query("CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        clave VARCHAR(100) DEFAULT '',
        nom_p VARCHAR(255) NOT NULL,
        des VARCHAR(255) DEFAULT 'entero',
        cant DECIMAL(10,2) DEFAULT 0,
        categoria VARCHAR(100) DEFAULT 'General',
        marca VARCHAR(100) DEFAULT 'MAZAL',
        unidad VARCHAR(50) DEFAULT 'pz',
        stock_min DECIMAL(10,2) DEFAULT 5,
        stock_max DECIMAL(10,2) DEFAULT 100,
        ubicacion VARCHAR(255) DEFAULT 'Bodega Principal',
        imagen VARCHAR(500) DEFAULT '',
        proveedor_id VARCHAR(100) DEFAULT 'PROV_01',
        raw_data LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('productos', [
        'clave' => "VARCHAR(100) DEFAULT ''",
        'nom_p' => "VARCHAR(255) NOT NULL",
        'des' => "VARCHAR(255) DEFAULT 'entero'",
        'cant' => "DECIMAL(10,2) DEFAULT 0",
        'categoria' => "VARCHAR(100) DEFAULT 'General'",
        'marca' => "VARCHAR(100) DEFAULT 'MAZAL'",
        'unidad' => "VARCHAR(50) DEFAULT 'pz'",
        'stock_min' => "DECIMAL(10,2) DEFAULT 5",
        'stock_max' => "DECIMAL(10,2) DEFAULT 100",
        'ubicacion' => "VARCHAR(255) DEFAULT 'Bodega Principal'",
        'imagen' => "VARCHAR(500) DEFAULT ''",
        'proveedor_id' => "VARCHAR(100) DEFAULT 'PROV_01'",
        'raw_data' => "LONGTEXT DEFAULT NULL",
        'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ]);

    // C. TABLA PRECIOS
    $db->query("CREATE TABLE IF NOT EXISTS precios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_producto INT NOT NULL,
        mayoreo DECIMAL(10,2) DEFAULT 0,
        medio DECIMAL(10,2) DEFAULT 0,
        menudeo DECIMAL(10,2) DEFAULT 0,
        Unitario DECIMAL(10,2) DEFAULT 0,
        precio_especial DECIMAL(10,2) DEFAULT 0,
        UNIQUE KEY uq_prod (id_producto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('precios', [
        'id_producto' => "INT NOT NULL",
        'mayoreo' => "DECIMAL(10,2) DEFAULT 0",
        'medio' => "DECIMAL(10,2) DEFAULT 0",
        'menudeo' => "DECIMAL(10,2) DEFAULT 0",
        'Unitario' => "DECIMAL(10,2) DEFAULT 0",
        'precio_especial' => "DECIMAL(10,2) DEFAULT 0"
    ]);

    // D. TABLA CLIENTES
    $db->query("CREATE TABLE IF NOT EXISTS clientes (
        id_cliente INT AUTO_INCREMENT PRIMARY KEY,
        nombre_c VARCHAR(255) NOT NULL,
        tel VARCHAR(50) DEFAULT '',
        cant_ade DECIMAL(10,2) DEFAULT 0,
        email VARCHAR(255) DEFAULT '',
        direccion VARCHAR(255) DEFAULT '',
        rfc VARCHAR(50) DEFAULT '',
        limite_credito DECIMAL(10,2) DEFAULT 0,
        dias_credito INT DEFAULT 30,
        notas TEXT DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'Activo',
        raw_data LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('clientes', [
        'nombre_c' => "VARCHAR(255) NOT NULL",
        'tel' => "VARCHAR(50) DEFAULT ''",
        'cant_ade' => "DECIMAL(10,2) DEFAULT 0",
        'email' => "VARCHAR(255) DEFAULT ''",
        'direccion' => "VARCHAR(255) DEFAULT ''",
        'rfc' => "VARCHAR(50) DEFAULT ''",
        'limite_credito' => "DECIMAL(10,2) DEFAULT 0",
        'dias_credito' => "INT DEFAULT 30",
        'notas' => "TEXT DEFAULT NULL",
        'status' => "VARCHAR(50) DEFAULT 'Activo'",
        'raw_data' => "LONGTEXT DEFAULT NULL",
        'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ]);

    // E. TABLA PROVEEDOR
    $db->query("CREATE TABLE IF NOT EXISTS proveedor (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        tel VARCHAR(50) DEFAULT '',
        empresa VARCHAR(255) DEFAULT '',
        adeudo DECIMAL(10,2) DEFAULT 0,
        email VARCHAR(255) DEFAULT '',
        direccion VARCHAR(255) DEFAULT '',
        rfc VARCHAR(50) DEFAULT '',
        contacto VARCHAR(255) DEFAULT '',
        raw_data LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('proveedor', [
        'nombre' => "VARCHAR(255) NOT NULL",
        'tel' => "VARCHAR(50) DEFAULT ''",
        'empresa' => "VARCHAR(255) DEFAULT ''",
        'adeudo' => "DECIMAL(10,2) DEFAULT 0",
        'email' => "VARCHAR(255) DEFAULT ''",
        'direccion' => "VARCHAR(255) DEFAULT ''",
        'rfc' => "VARCHAR(50) DEFAULT ''",
        'contacto' => "VARCHAR(255) DEFAULT ''",
        'raw_data' => "LONGTEXT DEFAULT NULL",
        'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ]);

    // F. TABLA VENTAS
    $db->query("CREATE TABLE IF NOT EXISTS ventas (
        id_venta INT AUTO_INCREMENT PRIMARY KEY,
        ticket_number VARCHAR(100) DEFAULT '',
        id_producto INT DEFAULT NULL,
        descripcion VARCHAR(255) DEFAULT '',
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        cantidad DECIMAL(10,2) DEFAULT 1,
        total DECIMAL(10,2) DEFAULT 0,
        total_utilidad DECIMAL(10,2) DEFAULT 0,
        id_cliente INT DEFAULT NULL,
        metodo_pago VARCHAR(50) DEFAULT 'Efectivo',
        sucursal VARCHAR(50) DEFAULT 'Norte',
        raw_data LONGTEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('ventas', [
        'ticket_number' => "VARCHAR(100) DEFAULT ''",
        'id_producto' => "INT DEFAULT NULL",
        'descripcion' => "VARCHAR(255) DEFAULT ''",
        'fecha' => "DATETIME DEFAULT CURRENT_TIMESTAMP",
        'cantidad' => "DECIMAL(10,2) DEFAULT 1",
        'total' => "DECIMAL(10,2) DEFAULT 0",
        'total_utilidad' => "DECIMAL(10,2) DEFAULT 0",
        'id_cliente' => "INT DEFAULT NULL",
        'metodo_pago' => "VARCHAR(50) DEFAULT 'Efectivo'",
        'sucursal' => "VARCHAR(50) DEFAULT 'Norte'",
        'raw_data' => "LONGTEXT DEFAULT NULL"
    ]);

    // G. TABLA MOVIMIENTOS_INVENTARIO (KARDEX)
    $db->query("CREATE TABLE IF NOT EXISTS movimientos_inventario (
        id VARCHAR(100) PRIMARY KEY,
        product_id VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) DEFAULT '',
        type VARCHAR(50) DEFAULT 'AJUSTE',
        quantity DECIMAL(10,2) DEFAULT 0,
        previous_stock DECIMAL(10,2) DEFAULT 0,
        new_stock DECIMAL(10,2) DEFAULT 0,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_name VARCHAR(100) DEFAULT 'Admin',
        notes TEXT DEFAULT NULL,
        sucursal VARCHAR(50) DEFAULT 'Norte',
        raw_data LONGTEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // H. TABLA SESIONES_CAJA
    $db->query("CREATE TABLE IF NOT EXISTS sesiones_caja (
        id VARCHAR(100) PRIMARY KEY,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME DEFAULT NULL,
        opened_by VARCHAR(100) DEFAULT 'Admin',
        initial_cash DECIMAL(10,2) DEFAULT 0,
        final_cash DECIMAL(10,2) DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'Abierta',
        sales_total DECIMAL(10,2) DEFAULT 0,
        expenses_total DECIMAL(10,2) DEFAULT 0,
        expected_final_cash DECIMAL(10,2) DEFAULT 0,
        sucursal VARCHAR(50) DEFAULT 'Norte',
        raw_data LONGTEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // I. TABLA GASTOS_CAJA
    $db->query("CREATE TABLE IF NOT EXISTS gastos_caja (
        id VARCHAR(100) PRIMARY KEY,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) DEFAULT 0,
        category VARCHAR(100) DEFAULT 'General',
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_name VARCHAR(100) DEFAULT 'Admin',
        sucursal VARCHAR(50) DEFAULT 'Norte',
        raw_data LONGTEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // J. TABLA ORDENES_COMPRA
    $db->query("CREATE TABLE IF NOT EXISTS ordenes_compra (
        id VARCHAR(100) PRIMARY KEY,
        supplier_id VARCHAR(100) DEFAULT NULL,
        supplier_name VARCHAR(255) DEFAULT '',
        total DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Pendiente',
        date VARCHAR(50) DEFAULT '',
        received_date VARCHAR(50) DEFAULT NULL,
        payment_status VARCHAR(50) DEFAULT 'Pendiente',
        sucursal VARCHAR(50) DEFAULT 'Norte',
        raw_data LONGTEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // K. TABLA ROLES_PERMISOS
    $db->query("CREATE TABLE IF NOT EXISTS roles_permisos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rol VARCHAR(50) NOT NULL UNIQUE,
        pos TINYINT(1) DEFAULT 1,
        inventory TINYINT(1) DEFAULT 0,
        customers TINYINT(1) DEFAULT 0,
        purchases TINYINT(1) DEFAULT 0,
        reports TINYINT(1) DEFAULT 0,
        security TINYINT(1) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // L. TABLA MAZAL_APP_STATE
    $db->query("CREATE TABLE IF NOT EXISTS mazal_app_state (
        id INT PRIMARY KEY,
        branch VARCHAR(50) NOT NULL,
        json_data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // M. ASEGURAR ADMINISTRADOR GENERAL MAESTRO (solo si no existe)
    $db->query("INSERT INTO usuarios (usuario, nombrecompleto, password, rol) 
                SELECT 'admin', 'Administrador General', 'admin030114', 'administrador' 
                WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario = 'admin');");
}

// Ejecutar auto-migración garantizada en cada arranque
autoMigrateSchema($mysqli, $dbname);

$action = isset($_GET['action']) ? $_GET['action'] : (isset($_POST['action']) ? $_POST['action'] : (isset($postData['action']) ? $postData['action'] : ''));

// 0. LOGIN & AUTENTICACIÓN (Server-Side)
if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $userIn = isset($postData['username']) ? trim($postData['username']) : (isset($postData['usuario']) ? trim($postData['usuario']) : '');
    $passIn = isset($postData['password']) ? trim($postData['password']) : '';

    if (empty($userIn) || empty($passIn)) {
        echo json_encode(["success" => false, "error" => "Usuario y contraseña son requeridos."]);
        exit;
    }

    $stmt = $mysqli->prepare("SELECT id, usuario, nombrecompleto, password, rol FROM usuarios WHERE usuario = ?");
    $stmt->bind_param("s", $userIn);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res && $row = $res->fetch_assoc()) {
        $storedPass = $row['password'];
        $isValid = false;

        if ($passIn === $storedPass) {
            $isValid = true;
        } else if (password_verify($passIn, $storedPass)) {
            $isValid = true;
        } else if (hash('sha256', $passIn) === strtolower($storedPass)) {
            $isValid = true;
        }

        if ($isValid) {
            echo json_encode([
                "success" => true,
                "message" => "Acceso autorizado.",
                "user" => [
                    "id" => (string)$row['id'],
                    "username" => $row['usuario'],
                    "name" => $row['nombrecompleto'] ?: $row['usuario'],
                    "role" => $row['rol'] ?: 'vendedor',
                    "branch" => $branch,
                    "database" => $dbname
                ]
            ]);
            exit;
        }
    }

    echo json_encode(["success" => false, "error" => "Credenciales incorrectas."]);
    exit;
}

// 1. PING & HEALTH CHECK
if ($action === 'ping') {
    $resProds = $mysqli->query("SELECT count(*) as total FROM productos");
    $totalProds = ($resProds && $row = $resProds->fetch_assoc()) ? (int)$row['total'] : 0;

    $resVentas = $mysqli->query("SELECT count(*) as total FROM ventas");
    $totalVentas = ($resVentas && $row = $resVentas->fetch_assoc()) ? (int)$row['total'] : 0;

    $resUsers = $mysqli->query("SELECT count(*) as total FROM usuarios");
    $totalUsers = ($resUsers && $rowU = $resUsers->fetch_assoc()) ? (int)$rowU['total'] : 0;

    $resCust = $mysqli->query("SELECT count(*) as total FROM clientes");
    $totalCust = ($resCust && $rowC = $resCust->fetch_assoc()) ? (int)$rowC['total'] : 0;

    $resProv = $mysqli->query("SELECT count(*) as total FROM proveedor");
    $totalProv = ($resProv && $rowP = $resProv->fetch_assoc()) ? (int)$rowP['total'] : 0;

    echo json_encode([
        "success" => true,
        "branch" => $branch,
        "database" => $dbname,
        "total_productos" => $totalProds,
        "total_ventas" => $totalVentas,
        "total_usuarios" => $totalUsers,
        "total_clientes" => $totalCust,
        "total_proveedores" => $totalProv,
        "server" => "Apache / XAMPP",
        "status" => "online",
        "timestamp" => date("Y-m-d H:i:s")
    ]);
    exit;
}

// 2. OBTENER PERMISOS
if ($action === 'get_permissions') {
    $res = $mysqli->query("SELECT * FROM roles_permisos");
    $permissions = [];
    
    $defaults = [
        "Administrador" => ["pos" => true, "inventory" => true, "customers" => true, "purchases" => true, "reports" => true, "security" => true],
        "Gerente" => ["pos" => true, "inventory" => true, "customers" => true, "purchases" => true, "reports" => true, "security" => false],
        "Cajero" => ["pos" => true, "inventory" => false, "customers" => true, "purchases" => false, "reports" => false, "security" => false],
        "Almacenista" => ["pos" => false, "inventory" => true, "customers" => false, "purchases" => false, "reports" => false, "security" => false],
        "Compras" => ["pos" => false, "inventory" => true, "customers" => false, "purchases" => true, "reports" => false, "security" => false],
        "Contabilidad" => ["pos" => false, "inventory" => false, "customers" => true, "purchases" => true, "reports" => true, "security" => false],
    ];

    if ($res && $res->num_rows > 0) {
        while ($row = $res->fetch_assoc()) {
            $permissions[$row['rol']] = [
                "pos" => (bool)$row['pos'],
                "inventory" => (bool)$row['inventory'],
                "customers" => (bool)$row['customers'],
                "purchases" => (bool)$row['purchases'],
                "reports" => (bool)$row['reports'],
                "security" => (bool)$row['security'],
            ];
        }
    } else {
        foreach ($defaults as $rol => $p) {
            $stmt = $mysqli->prepare("INSERT INTO roles_permisos (rol, pos, inventory, customers, purchases, reports, security) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE pos=VALUES(pos), inventory=VALUES(inventory), customers=VALUES(customers), purchases=VALUES(purchases), reports=VALUES(reports), security=VALUES(security)");
            $p_pos = (int)$p['pos'];
            $p_inv = (int)$p['inventory'];
            $p_cust = (int)$p['customers'];
            $p_pur = (int)$p['purchases'];
            $p_rep = (int)$p['reports'];
            $p_sec = (int)$p['security'];
            $stmt->bind_param("siiiiii", $rol, $p_pos, $p_inv, $p_cust, $p_pur, $p_rep, $p_sec);
            $stmt->execute();
        }
        $permissions = $defaults;
    }

    echo json_encode([
        "success" => true,
        "branch" => $branch,
        "database" => $dbname,
        "permissions" => $permissions,
        "source" => "MySQL ({$dbname}.roles_permisos)"
    ]);
    exit;
}

// 3. GUARDAR PERMISOS
if ($action === 'save_permissions' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$postData || !isset($postData['permissions'])) {
        echo json_encode(["success" => false, "error" => "Datos de permisos no proporcionados."]);
        exit;
    }

    $permissions = $postData['permissions'];
    $updatedRoles = [];

    $stmt = $mysqli->prepare("INSERT INTO roles_permisos (rol, pos, inventory, customers, purchases, reports, security) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE pos=VALUES(pos), inventory=VALUES(inventory), customers=VALUES(customers), purchases=VALUES(purchases), reports=VALUES(reports), security=VALUES(security)");

    foreach ($permissions as $rol => $perms) {
        $p_pos = isset($perms['pos']) ? (int)$perms['pos'] : 0;
        $p_inv = isset($perms['inventory']) ? (int)$perms['inventory'] : 0;
        $p_cust = isset($perms['customers']) ? (int)$perms['customers'] : 0;
        $p_pur = isset($perms['purchases']) ? (int)$perms['purchases'] : 0;
        $p_rep = isset($perms['reports']) ? (int)$perms['reports'] : 0;
        $p_sec = isset($perms['security']) ? (int)$perms['security'] : 0;

        if ($rol === "Administrador") {
            $p_pos = $p_inv = $p_cust = $p_pur = $p_rep = $p_sec = 1;
        }

        $stmt->bind_param("siiiiii", $rol, $p_pos, $p_inv, $p_cust, $p_pur, $p_rep, $p_sec);
        $stmt->execute();
        $updatedRoles[] = $rol;
    }

    echo json_encode([
        "success" => true,
        "message" => "Matriz de permisos actualizada exitosamente en MySQL ({$dbname}).",
        "updatedRoles" => $updatedRoles,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 4. GUARDAR ESTADO COMPLETO EN SQL
if ($action === 'save_state' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = 1;
    if ($branch === 'Sur') $id = 2;
    if ($branch === 'Centro') $id = 3;
    if ($branch === 'Bodega') $id = 4;

    // 4.1 Guardar JSON completo en tabla mazal_app_state
    $stmt = $mysqli->prepare("INSERT INTO mazal_app_state (id, branch, json_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE branch=VALUES(branch), json_data=VALUES(json_data)");
    $stmt->bind_param("iss", $id, $branch, $rawInput);
    $stmt->execute();

    // 4.2 Sincronizar clientes con la tabla nativa de MySQL
    if ($postData && isset($postData['customers']) && is_array($postData['customers'])) {
        foreach ($postData['customers'] as $c) {
            $rawId = isset($c['id']) ? (string)$c['id'] : '';
            $cId = (int)preg_replace('/[^0-9]/', '', $rawId);
            $cName = isset($c['name']) ? trim($c['name']) : (isset($c['nombre_c']) ? trim($c['nombre_c']) : '');
            $cTel = isset($c['phone']) ? trim($c['phone']) : (isset($c['tel']) ? trim($c['tel']) : '');
            $cDebt = isset($c['creditUsed']) ? (float)$c['creditUsed'] : (isset($c['cant_ade']) ? (float)$c['cant_ade'] : 0);
            $cEmail = isset($c['email']) ? trim($c['email']) : '';
            $cDir = isset($c['address']) ? trim($c['address']) : (isset($c['direccion']) ? trim($c['direccion']) : '');
            $cRfc = isset($c['rfc']) ? trim($c['rfc']) : '';
            $cLim = isset($c['creditLimit']) ? (float)$c['creditLimit'] : 0;
            $cRaw = json_encode($c);

            if (!empty($cName)) {
                if ($cId > 0) {
                    $stmtC = $mysqli->prepare("INSERT INTO clientes (id_cliente, nombre_c, tel, cant_ade, email, direccion, rfc, limite_credito, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre_c=VALUES(nombre_c), tel=VALUES(tel), cant_ade=VALUES(cant_ade), email=VALUES(email), direccion=VALUES(direccion), rfc=VALUES(rfc), limite_credito=VALUES(limite_credito), raw_data=VALUES(raw_data)");
                    $stmtC->bind_param("issdsssds", $cId, $cName, $cTel, $cDebt, $cEmail, $cDir, $cRfc, $cLim, $cRaw);
                    $stmtC->execute();
                } else {
                    $stmtC = $mysqli->prepare("INSERT INTO clientes (nombre_c, tel, cant_ade, email, direccion, rfc, limite_credito, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmtC->bind_param("ssdsssds", $cName, $cTel, $cDebt, $cEmail, $cDir, $cRfc, $cLim, $cRaw);
                    $stmtC->execute();
                }
            }
        }
    }

    // 4.3 Sincronizar proveedores con la tabla nativa de MySQL
    if ($postData && isset($postData['suppliers']) && is_array($postData['suppliers'])) {
        foreach ($postData['suppliers'] as $s) {
            $rawId = isset($s['id']) ? (string)$s['id'] : '';
            $sId = (int)preg_replace('/[^0-9]/', '', $rawId);
            $sName = isset($s['name']) ? trim($s['name']) : (isset($s['nombre']) ? trim($s['nombre']) : '');
            $sTel = isset($s['phone']) ? trim($s['phone']) : (isset($s['tel']) ? trim($s['tel']) : '');
            $sEmpresa = isset($s['company']) ? trim($s['company']) : (isset($s['empresa']) ? trim($s['empresa']) : $sName);
            $sAdeudo = isset($s['outstandingBalance']) ? (float)$s['outstandingBalance'] : (isset($s['adeudo']) ? (float)$s['adeudo'] : 0);
            $sRaw = json_encode($s);

            if (!empty($sName)) {
                if ($sId > 0) {
                    $stmtS = $mysqli->prepare("INSERT INTO proveedor (id, nombre, tel, empresa, adeudo, raw_data) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), tel=VALUES(tel), empresa=VALUES(empresa), adeudo=VALUES(adeudo), raw_data=VALUES(raw_data)");
                    $stmtS->bind_param("isssds", $sId, $sName, $sTel, $sEmpresa, $sAdeudo, $sRaw);
                    $stmtS->execute();
                } else {
                    $stmtS = $mysqli->prepare("INSERT INTO proveedor (nombre, tel, empresa, adeudo, raw_data) VALUES (?, ?, ?, ?, ?)");
                    $stmtS->bind_param("sssds", $sName, $sTel, $sEmpresa, $sAdeudo, $sRaw);
                    $stmtS->execute();
                }
            }
        }
    }

    // 4.4 Sincronizar productos y precios con la tabla nativa de MySQL
    if ($postData && isset($postData['products']) && is_array($postData['products'])) {
        foreach ($postData['products'] as $p) {
            $rawId = isset($p['id']) ? (string)$p['id'] : '';
            $pId = (int)preg_replace('/[^0-9]/', '', $rawId);
            $pClave = isset($p['code']) ? trim($p['code']) : (isset($p['clave']) ? trim($p['clave']) : '');
            $pName = isset($p['name']) ? trim($p['name']) : (isset($p['nom_p']) ? trim($p['nom_p']) : '');
            $pDes = isset($p['subcategory']) ? trim($p['subcategory']) : (isset($p['des']) ? trim($p['des']) : 'entero');
            $pCant = isset($p['stock']) ? (float)$p['stock'] : (isset($p['cant']) ? (float)$p['cant'] : 0);

            $pMayoreo = isset($p['priceMax']) ? round((float)$p['priceMax'], 2) : (isset($p['mayoreo']) ? round((float)$p['mayoreo'], 2) : 0);
            $pMedio = isset($p['priceMed']) ? round((float)$p['priceMed'], 2) : (isset($p['medio']) ? round((float)$p['medio'], 2) : 0);
            $pMenudeo = isset($p['priceMin']) ? round((float)$p['priceMin'], 2) : (isset($p['menudeo']) ? round((float)$p['menudeo'], 2) : 0);
            $pUnitario = isset($p['cost']) ? strval(round((float)$p['cost'], 2)) : (isset($p['unitario']) ? strval(round((float)$p['unitario'], 2)) : '0');
            $pEspecial = isset($p['priceSpecial']) ? round((float)$p['priceSpecial'], 2) : 0;
            $pRaw = json_encode($p);

            if (!empty($pName)) {
                if ($pId > 0) {
                    $stmtP = $mysqli->prepare("INSERT INTO productos (id, clave, nom_p, des, cant, raw_data) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE clave=VALUES(clave), nom_p=VALUES(nom_p), des=VALUES(des), cant=VALUES(cant), raw_data=VALUES(raw_data)");
                    $stmtP->bind_param("isssds", $pId, $pClave, $pName, $pDes, $pCant, $pRaw);
                    $stmtP->execute();

                    $stmtPr = $mysqli->prepare("INSERT INTO precios (id_producto, mayoreo, medio, menudeo, Unitario, precio_especial) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE mayoreo=VALUES(mayoreo), medio=VALUES(medio), menudeo=VALUES(menudeo), Unitario=VALUES(Unitario), precio_especial=VALUES(precio_especial)");
                    $stmtPr->bind_param("idddsd", $pId, $pMayoreo, $pMedio, $pMenudeo, $pUnitario, $pEspecial);
                    $stmtPr->execute();
                } else {
                    $stmtP = $mysqli->prepare("INSERT INTO productos (clave, nom_p, des, cant, raw_data) VALUES (?, ?, ?, ?, ?)");
                    $stmtP->bind_param("sssds", $pClave, $pName, $pDes, $pCant, $pRaw);
                    $stmtP->execute();
                    $newProdId = $mysqli->insert_id;
                    if ($newProdId > 0) {
                        $stmtPr = $mysqli->prepare("INSERT INTO precios (id_producto, mayoreo, medio, menudeo, Unitario, precio_especial) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE mayoreo=VALUES(mayoreo), medio=VALUES(medio), menudeo=VALUES(menudeo), Unitario=VALUES(Unitario), precio_especial=VALUES(precio_especial)");
                        $stmtPr->bind_param("idddsd", $newProdId, $pMayoreo, $pMedio, $pMenudeo, $pUnitario, $pEspecial);
                        $stmtPr->execute();
                    }
                }
            }
        }
    }

    // 4.5 Sincronizar ventas con la tabla nativa de MySQL
    if ($postData && isset($postData['sales']) && is_array($postData['sales'])) {
        foreach ($postData['sales'] as $v) {
            $rawId = isset($v['id']) ? (string)$v['id'] : '';
            $vId = (int)preg_replace('/[^0-9]/', '', $rawId);
            $vTicket = isset($v['ticketNumber']) ? trim($v['ticketNumber']) : (isset($v['ticket_number']) ? trim($v['ticket_number']) : ($rawId ? "TICK-{$rawId}" : ''));
            $vDesc = isset($v['description']) ? trim($v['description']) : (isset($v['descripcion']) ? trim($v['descripcion']) : "Venta Ticket {$vTicket}");
            $vFecha = isset($v['date']) ? trim($v['date']) : (isset($v['fecha']) ? trim($v['fecha']) : date("Y-m-d H:i:s"));
            $vTotal = isset($v['total']) ? (float)$v['total'] : 0;
            $vProfit = isset($v['profit']) ? (float)$v['profit'] : (isset($v['total_utilidad']) ? (float)$v['total_utilidad'] : 0);
            $vMetodo = isset($v['paymentMethod']) ? trim($v['paymentMethod']) : (isset($v['metodo_pago']) ? trim($v['metodo_pago']) : 'Efectivo');
            $vSucursal = isset($v['sucursal']) ? trim($v['sucursal']) : $branch;
            $vRaw = json_encode($v);

            $rawCustId = isset($v['customerId']) ? (string)$v['customerId'] : (isset($v['id_cliente']) ? (string)$v['id_cliente'] : '');
            $vClienteId = !empty($rawCustId) ? (int)preg_replace('/[^0-9]/', '', $rawCustId) : null;
            if ($vClienteId === 0) $vClienteId = null;

            if ($vId > 0) {
                $stmtV = $mysqli->prepare("INSERT INTO ventas (id_venta, ticket_number, descripcion, fecha, total, total_utilidad, id_cliente, metodo_pago, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ticket_number=VALUES(ticket_number), descripcion=VALUES(descripcion), fecha=VALUES(fecha), total=VALUES(total), total_utilidad=VALUES(total_utilidad), id_cliente=VALUES(id_cliente), metodo_pago=VALUES(metodo_pago), sucursal=VALUES(sucursal), raw_data=VALUES(raw_data)");
                $stmtV->bind_param("isssddisss", $vId, $vTicket, $vDesc, $vFecha, $vTotal, $vProfit, $vClienteId, $vMetodo, $vSucursal, $vRaw);
                $stmtV->execute();
            } else {
                $stmtV = $mysqli->prepare("INSERT INTO ventas (ticket_number, descripcion, fecha, total, total_utilidad, id_cliente, metodo_pago, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmtV->bind_param("sssddisss", $vTicket, $vDesc, $vFecha, $vTotal, $vProfit, $vClienteId, $vMetodo, $vSucursal, $vRaw);
                $stmtV->execute();
            }
        }
    }

    echo json_encode([
        "success" => true,
        "message" => "Estado de la sucursal {$branch} y tablas nativas sincronizados en {$dbname}.",
        "branch" => $branch,
        "database" => $dbname,
        "timestamp" => date("Y-m-d H:i:s")
    ]);
    exit;
}

// 5. CARGAR ESTADO DESDE SQL
if ($action === 'get_state') {
    $id = 1;
    if ($branch === 'Sur') $id = 2;
    if ($branch === 'Centro') $id = 3;
    if ($branch === 'Bodega') $id = 4;

    $res = $mysqli->query("SELECT json_data, updated_at FROM mazal_app_state WHERE id = {$id}");
    if ($res && $res->num_rows > 0) {
        $row = $res->fetch_assoc();
        $parsed = json_decode($row['json_data'], true);
        echo json_encode([
            "success" => true,
            "data" => $parsed,
            "updated_at" => $row['updated_at'],
            "branch" => $branch,
            "database" => $dbname,
            "source" => "MySQL ({$dbname}.mazal_app_state)"
        ]);
    } else {
        echo json_encode([
            "success" => false,
            "data" => null,
            "branch" => $branch,
            "database" => $dbname,
            "message" => "Sin estado previo guardado en MySQL para {$branch}."
        ]);
    }
    exit;
}

// 6. CARGAR TABLAS NATIVAS DE MYSQL
if ($action === 'get_native_tables') {
    $usuarios = [];
    $resU = $mysqli->query("SELECT id, usuario, nombrecompleto, password, rol FROM usuarios ORDER BY id ASC");
    if ($resU) {
        while ($row = $resU->fetch_assoc()) {
            $usuarios[] = $row;
        }
    }

    $clientes = [];
    $resC = $mysqli->query("SELECT id_cliente, nombre_c, tel, ROUND(cant_ade, 2) as cant_ade, email, direccion, rfc, limite_credito, dias_credito, notas, status, raw_data FROM clientes");
    if ($resC) {
        while ($row = $resC->fetch_assoc()) {
            $clientes[] = $row;
        }
    }

    $proveedores = [];
    $resProv = $mysqli->query("SELECT id, nombre, tel, empresa, ROUND(adeudo, 2) as adeudo, email, direccion, rfc, contacto, raw_data FROM proveedor");
    if ($resProv) {
        while ($row = $resProv->fetch_assoc()) {
            $proveedores[] = $row;
        }
    }

    $productos = [];
    $resP = $mysqli->query("
        SELECT p.id, p.clave, p.nom_p, p.des, p.cant, p.categoria, p.marca, p.unidad, p.stock_min, p.stock_max, p.ubicacion, p.imagen, p.proveedor_id, p.raw_data,
               ROUND(COALESCE(pr.mayoreo, 0), 2) as mayoreo,
               ROUND(COALESCE(pr.medio, 0), 2) as medio,
               ROUND(COALESCE(pr.menudeo, 0), 2) as menudeo,
               ROUND(COALESCE(CAST(pr.Unitario AS DECIMAL(10,2)), 0), 2) as unitario,
               ROUND(COALESCE(pr.precio_especial, 0), 2) as precio_especial
        FROM productos p
        LEFT JOIN precios pr ON p.id = pr.id_producto
        GROUP BY p.id
        ORDER BY p.id ASC
    ");
    if ($resP) {
        while ($row = $resP->fetch_assoc()) {
            $productos[] = [
                "id" => (int)$row['id'],
                "clave" => $row['clave'],
                "nom_p" => $row['nom_p'],
                "des" => $row['des'],
                "cant" => (float)$row['cant'],
                "categoria" => $row['categoria'] ?: 'General',
                "marca" => $row['marca'] ?: 'MAZAL',
                "unidad" => $row['unidad'] ?: 'pz',
                "stock_min" => (float)$row['stock_min'],
                "stock_max" => (float)$row['stock_max'],
                "ubicacion" => $row['ubicacion'] ?: 'Bodega Principal',
                "imagen" => $row['imagen'] ?: '',
                "proveedor_id" => $row['proveedor_id'] ?: 'PROV_01',
                "mayoreo" => round((float)$row['mayoreo'], 2),
                "medio" => round((float)$row['medio'], 2),
                "menudeo" => round((float)$row['menudeo'], 2),
                "unitario" => round((float)$row['unitario'], 2),
                "precio_especial" => round((float)$row['precio_especial'], 2),
                "raw_data" => $row['raw_data'] ? json_decode($row['raw_data'], true) : null
            ];
        }
    }

    $movements = [];
    $resM = $mysqli->query("SELECT * FROM movimientos_inventario ORDER BY date DESC LIMIT 300");
    if ($resM) {
        while ($row = $resM->fetch_assoc()) {
            $movements[] = $row;
        }
    }

    $cashSessions = [];
    $resCS = $mysqli->query("SELECT * FROM sesiones_caja ORDER BY start_time DESC LIMIT 50");
    if ($resCS) {
        while ($row = $resCS->fetch_assoc()) {
            $cashSessions[] = $row;
        }
    }

    $expenses = [];
    $resE = $mysqli->query("SELECT * FROM gastos_caja ORDER BY date DESC LIMIT 100");
    if ($resE) {
        while ($row = $resE->fetch_assoc()) {
            $expenses[] = $row;
        }
    }

    $purchaseOrders = [];
    $resPO = $mysqli->query("SELECT * FROM ordenes_compra ORDER BY date DESC LIMIT 100");
    if ($resPO) {
        while ($row = $resPO->fetch_assoc()) {
            $purchaseOrders[] = $row;
        }
    }

    $totalVentas = 0;
    $resV = $mysqli->query("SELECT count(*) as total FROM ventas");
    if ($resV && $rowV = $resV->fetch_assoc()) {
        $totalVentas = (int)$rowV['total'];
    }

    echo json_encode([
        "success" => true,
        "branch" => $branch,
        "database" => $dbname,
        "usuarios" => $usuarios,
        "clientes" => $clientes,
        "proveedores" => $proveedores,
        "productos" => $productos,
        "movimientos" => $movements,
        "sesiones_caja" => $cashSessions,
        "gastos" => $expenses,
        "ordenes_compra" => $purchaseOrders,
        "stats" => [
            "total_productos" => count($productos),
            "total_ventas" => $totalVentas,
            "total_proveedores" => count($proveedores),
            "total_clientes" => count($clientes),
            "total_usuarios" => count($usuarios)
        ],
        "source" => "MySQL ({$dbname})"
    ]);
    exit;
}

// 7. CARGAR HISTORIAL DE VENTAS
if ($action === 'get_historical_sales') {
    $ventas = [];
    $resV = $mysqli->query("
        SELECT v.id_venta, v.ticket_number, v.id_producto, p.nom_p, p.clave, v.descripcion, v.fecha, v.cantidad, 
               ROUND(v.total, 2) as total, 
               ROUND(v.total_utilidad, 2) as total_utilidad, 
               v.id_cliente, c.nombre_c, v.metodo_pago, v.sucursal, v.raw_data
        FROM ventas v
        LEFT JOIN productos p ON v.id_producto = p.id
        LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
        ORDER BY v.fecha DESC, v.id_venta DESC
        LIMIT 1000
    ");
    if ($resV) {
        while ($row = $resV->fetch_assoc()) {
            $ventas[] = $row;
        }
    }

    echo json_encode([
        "success" => true,
        "branch" => $branch,
        "database" => $dbname,
        "ventas" => $ventas,
        "source" => "MySQL ({$dbname}.ventas)"
    ]);
    exit;
}

// 8. GUARDAR / EDITAR PRODUCTO (CRUD: Create / Update)
if ($action === 'save_product' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : '';
    $prodId = (int)preg_replace('/[^0-9]/', '', $rawId);
    $clave  = isset($postData['code']) ? trim($postData['code']) : (isset($postData['clave']) ? trim($postData['clave']) : '');
    $nom_p  = isset($postData['name']) ? trim($postData['name']) : (isset($postData['nom_p']) ? trim($postData['nom_p']) : '');
    $des    = isset($postData['subcategory']) ? trim($postData['subcategory']) : (isset($postData['des']) ? trim($postData['des']) : 'entero');
    $cant   = isset($postData['stock']) ? (float)$postData['stock'] : (isset($postData['cant']) ? (float)$postData['cant'] : 0);
    $cat    = isset($postData['category']) ? trim($postData['category']) : (isset($postData['categoria']) ? trim($postData['categoria']) : 'General');
    $marca  = isset($postData['brand']) ? trim($postData['brand']) : (isset($postData['marca']) ? trim($postData['marca']) : 'MAZAL');
    $unidad = isset($postData['unit']) ? trim($postData['unit']) : (isset($postData['unidad']) ? trim($postData['unidad']) : 'pz');
    $stkMin = isset($postData['stockMin']) ? (float)$postData['stockMin'] : (isset($postData['stock_min']) ? (float)$postData['stock_min'] : 5);
    $stkMax = isset($postData['stockMax']) ? (float)$postData['stockMax'] : (isset($postData['stock_max']) ? (float)$postData['stock_max'] : 100);
    $ubic   = isset($postData['location']) ? trim($postData['location']) : (isset($postData['ubicacion']) ? trim($postData['ubicacion']) : 'Bodega Principal');
    $img    = isset($postData['imageUrl']) ? trim($postData['imageUrl']) : (isset($postData['imagen']) ? trim($postData['imagen']) : '');
    $provId = isset($postData['supplierId']) ? trim($postData['supplierId']) : (isset($postData['proveedor_id']) ? trim($postData['proveedor_id']) : 'PROV_01');
    $pRaw   = json_encode($postData);

    $mayoreo  = isset($postData['priceMax']) ? round((float)$postData['priceMax'], 2) : (isset($postData['mayoreo']) ? round((float)$postData['mayoreo'], 2) : 0);
    $medio    = isset($postData['priceMed']) ? round((float)$postData['priceMed'], 2) : (isset($postData['medio']) ? round((float)$postData['medio'], 2) : 0);
    $menudeo  = isset($postData['priceMin']) ? round((float)$postData['priceMin'], 2) : (isset($postData['menudeo']) ? round((float)$postData['menudeo'], 2) : 0);
    $unitario = isset($postData['cost']) ? strval(round((float)$postData['cost'], 2)) : (isset($postData['unitario']) ? strval(round((float)$postData['unitario'], 2)) : '0');
    $especial = isset($postData['priceSpecial']) ? round((float)$postData['priceSpecial'], 2) : 0;

    $existingId = 0;
    if ($prodId > 0) {
        $stmtC = $mysqli->prepare("SELECT id FROM productos WHERE id = ?");
        $stmtC->bind_param("i", $prodId);
        $stmtC->execute();
        $resC = $stmtC->get_result();
        if ($resC && $rowC = $resC->fetch_assoc()) {
            $existingId = (int)$rowC['id'];
        }
    }
    if (!$existingId && !empty($clave)) {
        $stmtC = $mysqli->prepare("SELECT id FROM productos WHERE clave = ? LIMIT 1");
        $stmtC->bind_param("s", $clave);
        $stmtC->execute();
        $resC = $stmtC->get_result();
        if ($resC && $rowC = $resC->fetch_assoc()) {
            $existingId = (int)$rowC['id'];
        }
    }

    if ($existingId > 0) {
        $stmtP = $mysqli->prepare("UPDATE productos SET clave = ?, nom_p = ?, des = ?, cant = ?, categoria = ?, marca = ?, unidad = ?, stock_min = ?, stock_max = ?, ubicacion = ?, imagen = ?, proveedor_id = ?, raw_data = ? WHERE id = ?");
        $stmtP->bind_param("sssddssssssssi", $clave, $nom_p, $des, $cant, $cat, $marca, $unidad, $stkMin, $stkMax, $ubic, $img, $provId, $pRaw, $existingId);
        $stmtP->execute();

        $stmtPr = $mysqli->prepare("INSERT INTO precios (id_producto, mayoreo, medio, menudeo, Unitario, precio_especial) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE mayoreo=VALUES(mayoreo), medio=VALUES(medio), menudeo=VALUES(menudeo), Unitario=VALUES(Unitario), precio_especial=VALUES(precio_especial)");
        $stmtPr->bind_param("idddsd", $existingId, $mayoreo, $medio, $menudeo, $unitario, $especial);
        $stmtPr->execute();
        $prodId = $existingId;
    } else {
        $stmtP = $mysqli->prepare("INSERT INTO productos (clave, nom_p, des, cant, categoria, marca, unidad, stock_min, stock_max, ubicacion, imagen, proveedor_id, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtP->bind_param("sssddssssssss", $clave, $nom_p, $des, $cant, $cat, $marca, $unidad, $stkMin, $stkMax, $ubic, $img, $provId, $pRaw);
        $stmtP->execute();
        $prodId = $mysqli->insert_id;

        if ($prodId > 0) {
            $stmtPr = $mysqli->prepare("INSERT INTO precios (id_producto, mayoreo, medio, menudeo, Unitario, precio_especial) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE mayoreo=VALUES(mayoreo), medio=VALUES(medio), menudeo=VALUES(menudeo), Unitario=VALUES(Unitario), precio_especial=VALUES(precio_especial)");
            $stmtPr->bind_param("idddsd", $prodId, $mayoreo, $medio, $menudeo, $unitario, $especial);
            $stmtPr->execute();
        }
    }

    echo json_encode([
        "success" => true,
        "message" => "Producto guardado exitosamente en {$dbname}.",
        "id" => $prodId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 9. ELIMINAR PRODUCTO (CRUD: Delete)
if ($action === 'delete_product' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : (isset($_GET['id']) ? (string)$_GET['id'] : '');
    $pId = (int)preg_replace('/[^0-9]/', '', $rawId);

    $deleted = false;
    if ($pId > 0) {
        $mysqli->query("DELETE FROM precios WHERE id_producto = {$pId}");
        $mysqli->query("DELETE FROM productos WHERE id = {$pId}");
        $deleted = true;
    }

    echo json_encode([
        "success" => $deleted,
        "message" => $deleted ? "Producto #{$pId} eliminado de MySQL ({$dbname})." : "ID de producto inválido.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 10. ACTUALIZAR STOCK
if ($action === 'update_stock' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : (isset($_GET['id']) ? (string)$_GET['id'] : '');
    $prodId = (int)preg_replace('/[^0-9]/', '', $rawId);
    $newStock = isset($postData['stock']) ? (float)$postData['stock'] : (isset($postData['cant']) ? (float)$postData['cant'] : 0);

    if ($prodId > 0) {
        $stmt = $mysqli->prepare("UPDATE productos SET cant = ? WHERE id = ?");
        $stmt->bind_param("di", $newStock, $prodId);
        $stmt->execute();

        echo json_encode([
            "success" => true,
            "message" => "Stock actualizado para producto #{$prodId} en {$dbname}.",
            "id" => $prodId,
            "stock" => $newStock,
            "branch" => $branch,
            "database" => $dbname
        ]);
        exit;
    }
}

// 11. GUARDAR CLIENTE (CRUD: Create / Update)
if ($action === 'save_customer' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : (isset($postData['id_cliente']) ? (string)$postData['id_cliente'] : '');
    $cId = (int)preg_replace('/[^0-9]/', '', $rawId);
    $cName = isset($postData['name']) ? trim($postData['name']) : (isset($postData['nombre_c']) ? trim($postData['nombre_c']) : '');
    $cTel = isset($postData['phone']) ? trim($postData['phone']) : (isset($postData['tel']) ? trim($postData['tel']) : '');
    $cDebt = isset($postData['creditUsed']) ? (float)$postData['creditUsed'] : (isset($postData['cant_ade']) ? (float)$postData['cant_ade'] : 0);
    $cEmail = isset($postData['email']) ? trim($postData['email']) : '';
    $cDir = isset($postData['address']) ? trim($postData['address']) : (isset($postData['direccion']) ? trim($postData['direccion']) : '');
    $cRfc = isset($postData['rfc']) ? trim($postData['rfc']) : '';
    $cLim = isset($postData['creditLimit']) ? (float)$postData['creditLimit'] : (isset($postData['limite_credito']) ? (float)$postData['limite_credito'] : 0);
    $cDias = isset($postData['creditDays']) ? (int)$postData['creditDays'] : (isset($postData['dias_credito']) ? (int)$postData['dias_credito'] : 30);
    $cNotas = isset($postData['notes']) ? trim($postData['notes']) : (isset($postData['notas']) ? trim($postData['notas']) : '');
    $cStatus = isset($postData['status']) ? trim($postData['status']) : 'Activo';
    $cRaw = json_encode($postData);

    if (empty($cName)) {
        echo json_encode(["success" => false, "error" => "El nombre del cliente es obligatorio."]);
        exit;
    }

    if ($cId > 0) {
        $stmtC = $mysqli->prepare("INSERT INTO clientes (id_cliente, nombre_c, tel, cant_ade, email, direccion, rfc, limite_credito, dias_credito, notas, status, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre_c=VALUES(nombre_c), tel=VALUES(tel), cant_ade=VALUES(cant_ade), email=VALUES(email), direccion=VALUES(direccion), rfc=VALUES(rfc), limite_credito=VALUES(limite_credito), dias_credito=VALUES(dias_credito), notas=VALUES(notas), status=VALUES(status), raw_data=VALUES(raw_data)");
        $stmtC->bind_param("issdsssdisss", $cId, $cName, $cTel, $cDebt, $cEmail, $cDir, $cRfc, $cLim, $cDias, $cNotas, $cStatus, $cRaw);
        $stmtC->execute();
    } else {
        $stmtC = $mysqli->prepare("INSERT INTO clientes (nombre_c, tel, cant_ade, email, direccion, rfc, limite_credito, dias_credito, notas, status, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtC->bind_param("ssdsssdisss", $cName, $cTel, $cDebt, $cEmail, $cDir, $cRfc, $cLim, $cDias, $cNotas, $cStatus, $cRaw);
        $stmtC->execute();
        $cId = $mysqli->insert_id;
    }

    echo json_encode([
        "success" => true,
        "message" => "Cliente guardado exitosamente en MySQL ({$dbname}).",
        "id" => $cId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 12. ELIMINAR CLIENTE (CRUD: Delete)
if ($action === 'delete_customer' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : (isset($postData['id_cliente']) ? (string)$postData['id_cliente'] : '');
    $cId = (int)preg_replace('/[^0-9]/', '', $rawId);
    $cName = isset($postData['name']) ? trim($postData['name']) : '';

    $deleted = false;
    if ($cId > 0) {
        $stmt = $mysqli->prepare("DELETE FROM clientes WHERE id_cliente = ?");
        $stmt->bind_param("i", $cId);
        $stmt->execute();
        $deleted = true;
    } else if (!empty($cName)) {
        $stmt = $mysqli->prepare("DELETE FROM clientes WHERE nombre_c = ?");
        $stmt->bind_param("s", $cName);
        $stmt->execute();
        $deleted = true;
    }

    echo json_encode([
        "success" => $deleted,
        "message" => $deleted ? "Cliente eliminado de MySQL ({$dbname})." : "ID o nombre de cliente no proporcionado.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 13. GUARDAR PROVEEDOR (CRUD: Create / Update)
if ($action === 'save_supplier' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : '';
    $sId = (int)preg_replace('/[^0-9]/', '', $rawId);
    $sName = isset($postData['name']) ? trim($postData['name']) : (isset($postData['nombre']) ? trim($postData['nombre']) : '');
    $sTel = isset($postData['phone']) ? trim($postData['phone']) : (isset($postData['tel']) ? trim($postData['tel']) : '');
    $sEmpresa = isset($postData['company']) ? trim($postData['company']) : (isset($postData['empresa']) ? trim($postData['empresa']) : $sName);
    $sAdeudo = isset($postData['outstandingBalance']) ? (float)$postData['outstandingBalance'] : (isset($postData['adeudo']) ? (float)$postData['adeudo'] : 0);
    $sEmail = isset($postData['email']) ? trim($postData['email']) : '';
    $sDir = isset($postData['address']) ? trim($postData['address']) : (isset($postData['direccion']) ? trim($postData['direccion']) : '');
    $sRfc = isset($postData['rfc']) ? trim($postData['rfc']) : '';
    $sContacto = isset($postData['contact']) ? trim($postData['contact']) : (isset($postData['contacto']) ? trim($postData['contacto']) : '');
    $sRaw = json_encode($postData);

    if (empty($sName)) {
        echo json_encode(["success" => false, "error" => "El nombre del proveedor es obligatorio."]);
        exit;
    }

    if ($sId > 0) {
        $stmtS = $mysqli->prepare("INSERT INTO proveedor (id, nombre, tel, empresa, adeudo, email, direccion, rfc, contacto, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), tel=VALUES(tel), empresa=VALUES(empresa), adeudo=VALUES(adeudo), email=VALUES(email), direccion=VALUES(direccion), rfc=VALUES(rfc), contacto=VALUES(contacto), raw_data=VALUES(raw_data)");
        $stmtS->bind_param("isssdsssss", $sId, $sName, $sTel, $sEmpresa, $sAdeudo, $sEmail, $sDir, $sRfc, $sContacto, $sRaw);
        $stmtS->execute();
    } else {
        $stmtS = $mysqli->prepare("INSERT INTO proveedor (nombre, tel, empresa, adeudo, email, direccion, rfc, contacto, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtS->bind_param("sssdsssss", $sName, $sTel, $sEmpresa, $sAdeudo, $sEmail, $sDir, $sRfc, $sContacto, $sRaw);
        $stmtS->execute();
        $sId = $mysqli->insert_id;
    }

    echo json_encode([
        "success" => true,
        "message" => "Proveedor guardado exitosamente en MySQL ({$dbname}).",
        "id" => $sId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 14. ELIMINAR PROVEEDOR (CRUD: Delete)
if ($action === 'delete_supplier' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : '';
    $sId = (int)preg_replace('/[^0-9]/', '', $rawId);

    $deleted = false;
    if ($sId > 0) {
        $stmt = $mysqli->prepare("DELETE FROM proveedor WHERE id = ?");
        $stmt->bind_param("i", $sId);
        $stmt->execute();
        $deleted = true;
    }

    echo json_encode([
        "success" => $deleted,
        "message" => $deleted ? "Proveedor eliminado de MySQL ({$dbname})." : "ID de proveedor inválido.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 15. GUARDAR VENTA DIRECTA (CRUD: Create / Update)
if ($action === 'save_sale' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : '';
    $vId = (int)preg_replace('/[^0-9]/', '', $rawId);
    $vTicket = isset($postData['ticketNumber']) ? trim($postData['ticketNumber']) : (isset($postData['ticket_number']) ? trim($postData['ticket_number']) : "TICK-" . time());
    $vDesc = isset($postData['description']) ? trim($postData['description']) : (isset($postData['descripcion']) ? trim($postData['descripcion']) : "Venta Ticket {$vTicket}");
    $vFecha = isset($postData['date']) ? trim($postData['date']) : (isset($postData['fecha']) ? trim($postData['fecha']) : date("Y-m-d H:i:s"));
    $vTotal = isset($postData['total']) ? (float)$postData['total'] : 0;
    $vProfit = isset($postData['profit']) ? (float)$postData['profit'] : (isset($postData['total_utilidad']) ? (float)$postData['total_utilidad'] : 0);
    $vMetodo = isset($postData['paymentMethod']) ? trim($postData['paymentMethod']) : (isset($postData['metodo_pago']) ? trim($postData['metodo_pago']) : 'Efectivo');
    $vSucursal = isset($postData['sucursal']) ? trim($postData['sucursal']) : $branch;
    $vRaw = json_encode($postData);

    $rawCustId = isset($postData['customerId']) ? (string)$postData['customerId'] : (isset($postData['id_cliente']) ? (string)$postData['id_cliente'] : '');
    $vClienteId = !empty($rawCustId) ? (int)preg_replace('/[^0-9]/', '', $rawCustId) : null;
    if ($vClienteId === 0) $vClienteId = null;

    if ($vId > 0) {
        $stmtV = $mysqli->prepare("INSERT INTO ventas (id_venta, ticket_number, descripcion, fecha, total, total_utilidad, id_cliente, metodo_pago, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ticket_number=VALUES(ticket_number), descripcion=VALUES(descripcion), fecha=VALUES(fecha), total=VALUES(total), total_utilidad=VALUES(total_utilidad), id_cliente=VALUES(id_cliente), metodo_pago=VALUES(metodo_pago), sucursal=VALUES(sucursal), raw_data=VALUES(raw_data)");
        $stmtV->bind_param("isssddisss", $vId, $vTicket, $vDesc, $vFecha, $vTotal, $vProfit, $vClienteId, $vMetodo, $vSucursal, $vRaw);
        $stmtV->execute();
    } else {
        $stmtV = $mysqli->prepare("INSERT INTO ventas (ticket_number, descripcion, fecha, total, total_utilidad, id_cliente, metodo_pago, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtV->bind_param("sssddisss", $vTicket, $vDesc, $vFecha, $vTotal, $vProfit, $vClienteId, $vMetodo, $vSucursal, $vRaw);
        $stmtV->execute();
        $vId = $mysqli->insert_id;
    }

    echo json_encode([
        "success" => true,
        "message" => "Venta guardada exitosamente en MySQL ({$dbname}).",
        "id" => $vId,
        "ticketNumber" => $vTicket,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 16. ELIMINAR VENTA (CRUD: Delete)
if ($action === 'delete_sale' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawId = isset($postData['id']) ? (string)$postData['id'] : '';
    $vId = (int)preg_replace('/[^0-9]/', '', $rawId);

    $deleted = false;
    if ($vId > 0) {
        $stmt = $mysqli->prepare("DELETE FROM ventas WHERE id_venta = ?");
        $stmt->bind_param("i", $vId);
        $stmt->execute();
        $deleted = true;
    }

    echo json_encode([
        "success" => $deleted,
        "message" => $deleted ? "Venta eliminada de MySQL ({$dbname})." : "ID de venta inválido.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 17. GUARDAR MOVIMIENTO DE INVENTARIO (KARDEX: Create / Update)
if ($action === 'save_movement' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $mId = isset($postData['id']) ? trim($postData['id']) : "MOV_" . time();
    $prodId = isset($postData['productId']) ? trim($postData['productId']) : (isset($postData['product_id']) ? trim($postData['product_id']) : '');
    $prodName = isset($postData['productName']) ? trim($postData['productName']) : (isset($postData['product_name']) ? trim($postData['product_name']) : '');
    $mType = isset($postData['type']) ? trim($postData['type']) : 'AJUSTE';
    $mQty = isset($postData['quantity']) ? (float)$postData['quantity'] : 0;
    $prevStock = isset($postData['previousStock']) ? (float)$postData['previousStock'] : (isset($postData['previous_stock']) ? (float)$postData['previous_stock'] : 0);
    $newStock = isset($postData['newStock']) ? (float)$postData['newStock'] : (isset($postData['new_stock']) ? (float)$postData['new_stock'] : 0);
    $mDate = isset($postData['date']) ? trim($postData['date']) : date("Y-m-d H:i:s");
    $mUser = isset($postData['user']) ? trim($postData['user']) : (isset($postData['user_name']) ? trim($postData['user_name']) : 'Admin');
    $mNotes = isset($postData['notes']) ? trim($postData['notes']) : '';
    $mSucursal = isset($postData['sucursal']) ? trim($postData['sucursal']) : $branch;
    $mRaw = json_encode($postData);

    $stmtM = $mysqli->prepare("INSERT INTO movimientos_inventario (id, product_id, product_name, type, quantity, previous_stock, new_stock, date, user_name, notes, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE product_id=VALUES(product_id), product_name=VALUES(product_name), type=VALUES(type), quantity=VALUES(quantity), previous_stock=VALUES(previous_stock), new_stock=VALUES(new_stock), date=VALUES(date), user_name=VALUES(user_name), notes=VALUES(notes), sucursal=VALUES(sucursal), raw_data=VALUES(raw_data)");
    $stmtM->bind_param("ssssdddsssss", $mId, $prodId, $prodName, $mType, $mQty, $prevStock, $newStock, $mDate, $mUser, $mNotes, $mSucursal, $mRaw);
    $stmtM->execute();

    echo json_encode([
        "success" => true,
        "message" => "Movimiento de inventario guardado en MySQL ({$dbname}).",
        "id" => $mId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 18. GUARDAR SESIÓN DE CAJA (CRUD: Create / Update)
if ($action === 'save_cash_session' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $csId = isset($postData['id']) ? trim($postData['id']) : "SESS_" . time();
    $sTime = isset($postData['startTime']) ? trim($postData['startTime']) : (isset($postData['start_time']) ? trim($postData['start_time']) : date("Y-m-d H:i:s"));
    $eTime = isset($postData['endTime']) ? trim($postData['endTime']) : (isset($postData['end_time']) ? trim($postData['end_time']) : null);
    $openedBy = isset($postData['openedBy']) ? trim($postData['openedBy']) : (isset($postData['opened_by']) ? trim($postData['opened_by']) : 'Admin');
    $initCash = isset($postData['initialCash']) ? (float)$postData['initialCash'] : (isset($postData['initial_cash']) ? (float)$postData['initial_cash'] : 0);
    $finalCash = isset($postData['finalCash']) ? (float)$postData['finalCash'] : (isset($postData['final_cash']) ? (float)$postData['final_cash'] : null);
    $csStatus = isset($postData['status']) ? trim($postData['status']) : 'Abierta';
    $salesTot = isset($postData['salesTotal']) ? (float)$postData['salesTotal'] : (isset($postData['sales_total']) ? (float)$postData['sales_total'] : 0);
    $expTot = isset($postData['expensesTotal']) ? (float)$postData['expensesTotal'] : (isset($postData['expenses_total']) ? (float)$postData['expenses_total'] : 0);
    $expFinal = isset($postData['expectedFinalCash']) ? (float)$postData['expectedFinalCash'] : (isset($postData['expected_final_cash']) ? (float)$postData['expected_final_cash'] : 0);
    $csSucursal = isset($postData['sucursal']) ? trim($postData['sucursal']) : $branch;
    $csRaw = json_encode($postData);

    $stmtCS = $mysqli->prepare("INSERT INTO sesiones_caja (id, start_time, end_time, opened_by, initial_cash, final_cash, status, sales_total, expenses_total, expected_final_cash, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE start_time=VALUES(start_time), end_time=VALUES(end_time), opened_by=VALUES(opened_by), initial_cash=VALUES(initial_cash), final_cash=VALUES(final_cash), status=VALUES(status), sales_total=VALUES(sales_total), expenses_total=VALUES(expenses_total), expected_final_cash=VALUES(expected_final_cash), sucursal=VALUES(sucursal), raw_data=VALUES(raw_data)");
    $stmtCS->bind_param("ssssddsdddss", $csId, $sTime, $eTime, $openedBy, $initCash, $finalCash, $csStatus, $salesTot, $expTot, $expFinal, $csSucursal, $csRaw);
    $stmtCS->execute();

    echo json_encode([
        "success" => true,
        "message" => "Sesión de caja guardada en MySQL ({$dbname}).",
        "id" => $csId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 19. GUARDAR GASTO DE CAJA (CRUD: Create / Update)
if ($action === 'save_expense' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $eId = isset($postData['id']) ? trim($postData['id']) : "EXP_" . time();
    $eDesc = isset($postData['description']) ? trim($postData['description']) : "Gasto";
    $eAmount = isset($postData['amount']) ? (float)$postData['amount'] : 0;
    $eCat = isset($postData['category']) ? trim($postData['category']) : "General";
    $eDate = isset($postData['date']) ? trim($postData['date']) : date("Y-m-d H:i:s");
    $eUser = isset($postData['user']) ? trim($postData['user']) : (isset($postData['user_name']) ? trim($postData['user_name']) : "Admin");
    $eSucursal = isset($postData['sucursal']) ? trim($postData['sucursal']) : $branch;
    $eRaw = json_encode($postData);

    $stmtE = $mysqli->prepare("INSERT INTO gastos_caja (id, description, amount, category, date, user_name, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE description=VALUES(description), amount=VALUES(amount), category=VALUES(category), date=VALUES(date), user_name=VALUES(user_name), sucursal=VALUES(sucursal), raw_data=VALUES(raw_data)");
    $stmtE->bind_param("ssdsssss", $eId, $eDesc, $eAmount, $eCat, $eDate, $eUser, $eSucursal, $eRaw);
    $stmtE->execute();

    echo json_encode([
        "success" => true,
        "message" => "Gasto guardado en MySQL ({$dbname}).",
        "id" => $eId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 20. ELIMINAR GASTO DE CAJA (CRUD: Delete)
if ($action === 'delete_expense' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $eId = isset($postData['id']) ? trim($postData['id']) : '';

    $deleted = false;
    if (!empty($eId)) {
        $stmt = $mysqli->prepare("DELETE FROM gastos_caja WHERE id = ?");
        $stmt->bind_param("s", $eId);
        $stmt->execute();
        $deleted = true;
    }

    echo json_encode([
        "success" => $deleted,
        "message" => $deleted ? "Gasto eliminado de MySQL ({$dbname})." : "ID de gasto inválido.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 21. GUARDAR ORDEN DE COMPRA (CRUD: Create / Update)
if ($action === 'save_purchase_order' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $poId = isset($postData['id']) ? trim($postData['id']) : "PO_" . time();
    $suppId = isset($postData['supplierId']) ? trim($postData['supplierId']) : (isset($postData['supplier_id']) ? trim($postData['supplier_id']) : '');
    $suppName = isset($postData['supplierName']) ? trim($postData['supplierName']) : (isset($postData['supplier_name']) ? trim($postData['supplier_name']) : '');
    $poTotal = isset($postData['total']) ? (float)$postData['total'] : 0;
    $poStatus = isset($postData['status']) ? trim($postData['status']) : 'Pendiente';
    $poDate = isset($postData['date']) ? trim($postData['date']) : date("Y-m-d");
    $poRecDate = isset($postData['receivedDate']) ? trim($postData['receivedDate']) : (isset($postData['received_date']) ? trim($postData['received_date']) : null);
    $poPayStatus = isset($postData['paymentStatus']) ? trim($postData['paymentStatus']) : (isset($postData['payment_status']) ? trim($postData['payment_status']) : 'Pendiente');
    $poSucursal = isset($postData['sucursal']) ? trim($postData['sucursal']) : $branch;
    $poRaw = json_encode($postData);

    $stmtPO = $mysqli->prepare("INSERT INTO ordenes_compra (id, supplier_id, supplier_name, total, status, date, received_date, payment_status, sucursal, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE supplier_id=VALUES(supplier_id), supplier_name=VALUES(supplier_name), total=VALUES(total), status=VALUES(status), date=VALUES(date), received_date=VALUES(received_date), payment_status=VALUES(payment_status), sucursal=VALUES(sucursal), raw_data=VALUES(raw_data)");
    $stmtPO->bind_param("sssdssssss", $poId, $suppId, $suppName, $poTotal, $poStatus, $poDate, $poRecDate, $poPayStatus, $poSucursal, $poRaw);
    $stmtPO->execute();

    echo json_encode([
        "success" => true,
        "message" => "Orden de compra guardada en MySQL ({$dbname}).",
        "id" => $poId,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 22. ELIMINAR ORDEN DE COMPRA (CRUD: Delete)
if ($action === 'delete_purchase_order' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $poId = isset($postData['id']) ? trim($postData['id']) : '';

    $deleted = false;
    if (!empty($poId)) {
        $stmt = $mysqli->prepare("DELETE FROM ordenes_compra WHERE id = ?");
        $stmt->bind_param("s", $poId);
        $stmt->execute();
        $deleted = true;
    }

    echo json_encode([
        "success" => $deleted,
        "message" => $deleted ? "Orden de compra eliminada de MySQL ({$dbname})." : "ID de orden inválido.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 23. GUARDAR / EDITAR USUARIO (CRUD: Create / Update)
if ($action === 'save_user' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $usuario = isset($postData['username']) ? trim($postData['username']) : (isset($postData['usuario']) ? trim($postData['usuario']) : '');
    $nombre  = isset($postData['name']) ? trim($postData['name']) : (isset($postData['nombrecompleto']) ? trim($postData['nombrecompleto']) : $usuario);
    $pass    = isset($postData['password']) ? trim($postData['password']) : '';
    $rol     = isset($postData['role']) ? trim($postData['role']) : (isset($postData['rol']) ? trim($postData['rol']) : 'vendedor');

    if (empty($usuario) || empty($pass)) {
        echo json_encode(["success" => false, "error" => "El nombre de usuario y contraseña son obligatorios."]);
        exit;
    }

    $rolNorm = strtolower($rol);
    if (strpos($rolNorm, 'admin') !== false) $rol = 'administrador';
    else if (strpos($rolNorm, 'geren') !== false) $rol = 'gerente';
    else if (strpos($rolNorm, 'alma') !== false) $rol = 'almacenista';
    else if (strpos($rolNorm, 'comp') !== false) $rol = 'compras';
    else if (strpos($rolNorm, 'conta') !== false) $rol = 'contabilidad';
    else $rol = 'vendedor';

    $stmtCheck = $mysqli->prepare("SELECT id FROM usuarios WHERE usuario = ?");
    $stmtCheck->bind_param("s", $usuario);
    $stmtCheck->execute();
    $resCheck = $stmtCheck->get_result();

    if ($resCheck && $resCheck->num_rows > 0) {
        $rowU = $resCheck->fetch_assoc();
        $userId = $rowU['id'];
        $stmtUp = $mysqli->prepare("UPDATE usuarios SET nombrecompleto = ?, password = ?, rol = ? WHERE id = ?");
        $stmtUp->bind_param("sssi", $nombre, $pass, $rol, $userId);
        $stmtUp->execute();
    } else {
        $stmtIns = $mysqli->prepare("INSERT INTO usuarios (usuario, nombrecompleto, password, rol) VALUES (?, ?, ?, ?)");
        $stmtIns->bind_param("ssss", $usuario, $nombre, $pass, $rol);
        $stmtIns->execute();
        $userId = $mysqli->insert_id;
    }

    echo json_encode([
        "success" => true,
        "message" => "Credenciales del usuario @{$usuario} persistidas en MySQL ({$dbname}).",
        "id" => $userId,
        "usuario" => $usuario,
        "nombre" => $nombre,
        "rol" => $rol,
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 24. ELIMINAR USUARIO (CRUD: Delete)
if ($action === 'delete_user' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $usuario = isset($postData['username']) ? trim($postData['username']) : (isset($postData['usuario']) ? trim($postData['usuario']) : '');
    
    if ($usuario === 'admin') {
        echo json_encode(["success" => false, "error" => "No es posible eliminar el Administrador Maestro del sistema."]);
        exit;
    }

    if (!empty($usuario)) {
        $stmtDel = $mysqli->prepare("DELETE FROM usuarios WHERE usuario = ?");
        $stmtDel->bind_param("s", $usuario);
        $stmtDel->execute();

        echo json_encode([
            "success" => true,
            "message" => "Usuario @{$usuario} eliminado de MySQL ({$dbname}).",
            "branch" => $branch,
            "database" => $dbname
        ]);
        exit;
    }
}

// Default response
echo json_encode([
    "success" => true,
    "system" => "Mazal POS & ERP Backend Multi-Sucursal",
    "branch" => $branch,
    "database" => $dbname,
    "message" => "Servidor Apache / XAMPP activo y listo para operar sin internet."
]);
?>
