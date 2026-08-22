<?php
/**
 * ==============================================================================
 * MAZAL POS & ERP - [LEGACY / DESARROLLO LOCAL OPCIONAL]
 * ==============================================================================
 * AVISO DE ARQUITECTURA:
 * El stack de producción oficial es Railway + Supabase PostgreSQL (Server-Side Node.js).
 * Este archivo PHP es exclusivamente para compatibilidad con entornos locales de desarrollo
 * basados en XAMPP/MySQL o herramientas de migración inicial.
 * NO SE UTILIZA NI SE DESPLIEGA EN EL SERVIDOR DE PRODUCCIÓN EN RAILWAY.
 * ==============================================================================
 */

// Headers CORS para permitir llamadas desde cualquier origen local y Vite Dev Server
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Manejo de preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuración de Servidor MySQL
$servername = "localhost";
$username   = "root";
$password   = "";

// Detección de Sucursal y Ruteo de Base de Datos
$rawInput = file_get_contents('php://input');
$postData = json_decode($rawInput, true) ?: [];

$branch = isset($_GET['branch']) ? trim($_GET['branch']) : (isset($_POST['branch']) ? trim($_POST['branch']) : (isset($postData['branch']) ? trim($postData['branch']) : 'Norte'));
if (empty($branch)) {
    $branch = 'Norte';
}

// Mapa de Sucursal a Base de Datos MySQL
$branchDbMap = [
    'MAZAL 1' => 'mazal_bd',   // MAZAL 1 (Principal): BD Principal y más actualizada
    'mazal 1' => 'mazal_bd',
    'Norte'   => 'mazal_bd',
    'MAZAL 2' => 'mazal_bd1',  // MAZAL 2 (Secundaria): BD Secundaria
    'mazal 2' => 'mazal_bd1',
    'Sur'     => 'mazal_bd1',
    'Centro'  => 'mazal_bd',
    'Bodega'  => 'mazal_bd',
    'Matriz'  => 'mazal_bd',
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
    // 1. Crear bases de datos automáticamente si no existen en un equipo nuevo
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
    // Helper para verificar y agregar columnas faltantes
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('productos', [
        'clave' => "VARCHAR(100) DEFAULT ''",
        'nom_p' => "VARCHAR(255) NOT NULL",
        'des' => "VARCHAR(255) DEFAULT 'entero'",
        'cant' => "DECIMAL(10,2) DEFAULT 0",
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
        UNIQUE KEY uq_prod (id_producto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('precios', [
        'id_producto' => "INT NOT NULL",
        'mayoreo' => "DECIMAL(10,2) DEFAULT 0",
        'medio' => "DECIMAL(10,2) DEFAULT 0",
        'menudeo' => "DECIMAL(10,2) DEFAULT 0",
        'Unitario' => "DECIMAL(10,2) DEFAULT 0"
    ]);

    // D. TABLA CLIENTES
    $db->query("CREATE TABLE IF NOT EXISTS clientes (
        id_cliente INT AUTO_INCREMENT PRIMARY KEY,
        nombre_c VARCHAR(255) NOT NULL,
        tel VARCHAR(50) DEFAULT '',
        cant_ade DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('clientes', [
        'nombre_c' => "VARCHAR(255) NOT NULL",
        'tel' => "VARCHAR(50) DEFAULT ''",
        'cant_ade' => "DECIMAL(10,2) DEFAULT 0",
        'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ]);

    // E. TABLA PROVEEDOR
    $db->query("CREATE TABLE IF NOT EXISTS proveedor (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        tel VARCHAR(50) DEFAULT '',
        empresa VARCHAR(255) DEFAULT '',
        adeudo DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('proveedor', [
        'nombre' => "VARCHAR(255) NOT NULL",
        'tel' => "VARCHAR(50) DEFAULT ''",
        'empresa' => "VARCHAR(255) DEFAULT ''",
        'adeudo' => "DECIMAL(10,2) DEFAULT 0",
        'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ]);

    // F. TABLA VENTAS
    $db->query("CREATE TABLE IF NOT EXISTS ventas (
        id_venta INT AUTO_INCREMENT PRIMARY KEY,
        id_producto INT DEFAULT NULL,
        descripcion VARCHAR(255) DEFAULT '',
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        cantidad DECIMAL(10,2) DEFAULT 1,
        total DECIMAL(10,2) DEFAULT 0,
        total_utilidad DECIMAL(10,2) DEFAULT 0,
        id_cliente INT DEFAULT NULL,
        metodo_pago VARCHAR(50) DEFAULT 'Efectivo',
        sucursal VARCHAR(50) DEFAULT 'Norte'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('ventas', [
        'id_producto' => "INT DEFAULT NULL",
        'descripcion' => "VARCHAR(255) DEFAULT ''",
        'fecha' => "DATETIME DEFAULT CURRENT_TIMESTAMP",
        'cantidad' => "DECIMAL(10,2) DEFAULT 1",
        'total' => "DECIMAL(10,2) DEFAULT 0",
        'total_utilidad' => "DECIMAL(10,2) DEFAULT 0",
        'id_cliente' => "INT DEFAULT NULL",
        'metodo_pago' => "VARCHAR(50) DEFAULT 'Efectivo'",
        'sucursal' => "VARCHAR(50) DEFAULT 'Norte'"
    ]);

    // G. TABLA ROLES_PERMISOS
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
    $ensureColumns('roles_permisos', [
        'rol' => "VARCHAR(50) NOT NULL UNIQUE",
        'pos' => "TINYINT(1) DEFAULT 1",
        'inventory' => "TINYINT(1) DEFAULT 0",
        'customers' => "TINYINT(1) DEFAULT 0",
        'purchases' => "TINYINT(1) DEFAULT 0",
        'reports' => "TINYINT(1) DEFAULT 0",
        'security' => "TINYINT(1) DEFAULT 0"
    ]);

    // H. TABLA MAZAL_APP_STATE
    $db->query("CREATE TABLE IF NOT EXISTS mazal_app_state (
        id INT PRIMARY KEY,
        branch VARCHAR(50) NOT NULL,
        json_data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $ensureColumns('mazal_app_state', [
        'branch' => "VARCHAR(50) NOT NULL",
        'json_data' => "LONGTEXT NOT NULL",
        'updated_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    ]);

    // I. ASEGURAR ADMINISTRADOR GENERAL MAESTRO (solo si no existe)
    $db->query("INSERT INTO usuarios (usuario, nombrecompleto, password, rol) 
                SELECT 'admin', 'Administrador General', 'admin030114', 'administrador' 
                WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario = 'admin');");
}

// Ejecutar auto-migración garantizada en cada arranque
autoMigrateSchema($mysqli, $dbname);

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 0. LOGIN & AUTENTICACIÓN SEGURA (Server-Side)
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

        // Comprobación flexible y robusta (Texto plano, Bcrypt o SHA-256)
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

    echo json_encode([
        "success" => true,
        "branch" => $branch,
        "database" => $dbname,
        "total_productos" => $totalProds,
        "total_ventas" => $totalVentas,
        "total_usuarios" => $totalUsers,
        "server" => "Apache / XAMPP",
        "status" => "online",
        "timestamp" => date("Y-m-d H:i:s")
    ]);
    exit;
}

// 2. OBTENER MATRIZ DE PERMISOS POR ROL
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

// 3. GUARDAR MATRIZ DE PERMISOS POR ROL
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
        "database" => $dbname,
        "timestamp" => date("Y-m-d H:i:s")
    ]);
    exit;
}

// 4. GUARDAR ESTADO COMPLETO EN SQL Y SINCRONIZAR TABLAS NATIVAS
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
        $validIds = [];
        foreach ($postData['customers'] as $c) {
            $rawId = isset($c['id']) ? (string)$c['id'] : '';
            $cId = (int)preg_replace('/[^0-9]/', '', $rawId);
            $cName = isset($c['name']) ? trim($c['name']) : (isset($c['nombre_c']) ? trim($c['nombre_c']) : '');
            $cTel = isset($c['phone']) ? trim($c['phone']) : (isset($c['tel']) ? trim($c['tel']) : '');
            $cDebt = isset($c['creditUsed']) ? (float)$c['creditUsed'] : (isset($c['cant_ade']) ? (float)$c['cant_ade'] : 0);

            if (!empty($cName)) {
                if ($cId > 0) {
                    $validIds[] = $cId;
                    $stmtC = $mysqli->prepare("INSERT INTO clientes (id_cliente, nombre_c, tel, cant_ade) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre_c=VALUES(nombre_c), tel=VALUES(tel), cant_ade=VALUES(cant_ade)");
                    $stmtC->bind_param("issd", $cId, $cName, $cTel, $cDebt);
                    $stmtC->execute();
                } else {
                    $stmtC = $mysqli->prepare("INSERT INTO clientes (nombre_c, tel, cant_ade) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE tel=VALUES(tel), cant_ade=VALUES(cant_ade)");
                    $stmtC->bind_param("ssd", $cName, $cTel, $cDebt);
                    $stmtC->execute();
                    if ($stmtC->insert_id) $validIds[] = (int)$stmtC->insert_id;
                }
            }
        }

        // Eliminar clientes que hayan sido borrados en el frontend
        if (count($validIds) > 0) {
            $idList = implode(',', $validIds);
            $mysqli->query("DELETE FROM clientes WHERE id_cliente NOT IN ({$idList})");
        } else {
            $mysqli->query("DELETE FROM clientes");
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

// 4.1 ELIMINAR CLIENTE DIRECTO
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
        "message" => $deleted ? "Cliente eliminado de MySQL." : "ID o nombre de cliente no proporcionado.",
        "branch" => $branch,
        "database" => $dbname
    ]);
    exit;
}

// 5. CARGAR ESTADO DE BASE DE DATOS DESDE SQL
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

// 6. CARGAR DATOS DESDE TABLAS NATIVAS DE MYSQL (productos con precios redondeados a 2 decimales, usuarios, clientes, proveedores, etc.)
if ($action === 'get_native_tables') {
    $usuarios = [];
    $resU = $mysqli->query("SELECT id, usuario, nombrecompleto, password, rol FROM usuarios ORDER BY id ASC");
    if ($resU) {
        while ($row = $resU->fetch_assoc()) {
            $usuarios[] = $row;
        }
    }

    $clientes = [];
    $resC = $mysqli->query("SELECT id_cliente, nombre_c, tel, ROUND(cant_ade, 2) as cant_ade FROM clientes");
    if ($resC) {
        while ($row = $resC->fetch_assoc()) {
            $clientes[] = $row;
        }
    }

    $proveedores = [];
    $resProv = $mysqli->query("SELECT id, nombre, tel, empresa, ROUND(adeudo, 2) as adeudo FROM proveedor");
    if ($resProv) {
        while ($row = $resProv->fetch_assoc()) {
            $proveedores[] = $row;
        }
    }

    $productos = [];
    $resP = $mysqli->query("
        SELECT p.id, p.clave, p.nom_p, p.des, p.cant,
               ROUND(COALESCE(pr.mayoreo, 0), 2) as mayoreo,
               ROUND(COALESCE(pr.medio, 0), 2) as medio,
               ROUND(COALESCE(pr.menudeo, 0), 2) as menudeo,
               ROUND(COALESCE(CAST(pr.Unitario AS DECIMAL(10,2)), 0), 2) as unitario
        FROM productos p
        LEFT JOIN precios pr ON p.id = pr.id_producto
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
                "mayoreo" => round((float)$row['mayoreo'], 2),
                "medio" => round((float)$row['medio'], 2),
                "menudeo" => round((float)$row['menudeo'], 2),
                "unitario" => round((float)$row['unitario'], 2),
            ];
        }
    }

    // Stats
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

// 7. CARGAR HISTORIAL DE VENTAS DESDE MYSQL
if ($action === 'get_historical_sales') {
    $ventas = [];
    $resV = $mysqli->query("
        SELECT v.id_venta, v.id_producto, p.nom_p, p.clave, v.descripcion, v.fecha, v.cantidad, 
               ROUND(v.total, 2) as total, 
               ROUND(v.total_utilidad, 2) as total_utilidad, 
               v.id_cliente, c.nombre_c
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

// 8. GUARDAR / ACTUALIZAR USUARIO EN MYSQL (Persistencia de Credenciales)
if ($action === 'save_user' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $usuario = isset($postData['username']) ? trim($postData['username']) : (isset($postData['usuario']) ? trim($postData['usuario']) : '');
    $nombre  = isset($postData['name']) ? trim($postData['name']) : (isset($postData['nombrecompleto']) ? trim($postData['nombrecompleto']) : $usuario);
    $pass    = isset($postData['password']) ? trim($postData['password']) : '';
    $rol     = isset($postData['role']) ? trim($postData['role']) : (isset($postData['rol']) ? trim($postData['rol']) : 'vendedor');

    if (empty($usuario) || empty($pass)) {
        echo json_encode(["success" => false, "error" => "El nombre de usuario y contraseña son obligatorios."]);
        exit;
    }

    // Normalizar rol para compatibilidad
    $rolNorm = strtolower($rol);
    if (strpos($rolNorm, 'admin') !== false) $rol = 'administrador';
    else if (strpos($rolNorm, 'geren') !== false) $rol = 'gerente';
    else if (strpos($rolNorm, 'alma') !== false) $rol = 'almacenista';
    else if (strpos($rolNorm, 'comp') !== false) $rol = 'compras';
    else if (strpos($rolNorm, 'conta') !== false) $rol = 'contabilidad';
    else $rol = 'vendedor';

    // Insert or update in MySQL
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

// 9. ELIMINAR USUARIO EN MYSQL
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

// 10. ACTUALIZAR STOCK DE PRODUCTO EN MYSQL
if ($action === 'update_stock' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $prodId = isset($postData['id']) ? (int)$postData['id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);
    $newStock = isset($postData['stock']) ? (float)$postData['stock'] : 0;

    if ($prodId > 0) {
        $stmt = $mysqli->prepare("UPDATE productos SET cant = ? WHERE id = ?");
        $stmt->bind_param("di", $newStock, $prodId);
        $stmt->execute();

        echo json_encode([
            "success" => true,
            "message" => "Stock actualizado para producto #{$prodId} en {$dbname}.",
            "branch" => $branch,
            "database" => $dbname,
            "id" => $prodId,
            "stock" => $newStock
        ]);
        exit;
    }
}

// 11. GUARDAR O EDITAR PRODUCTO EN MYSQL
if ($action === 'save_product' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $prodId = isset($postData['id']) ? (int)$postData['id'] : 0;
    $clave  = isset($postData['clave']) ? trim($postData['clave']) : '';
    $nom_p  = isset($postData['nom_p']) ? trim($postData['nom_p']) : '';
    $des    = isset($postData['des']) ? trim($postData['des']) : 'entero';
    $cant   = isset($postData['cant']) ? (float)$postData['cant'] : 0;
    
    $mayoreo  = isset($postData['mayoreo']) ? round((float)$postData['mayoreo'], 2) : 0;
    $medio    = isset($postData['medio']) ? round((float)$postData['medio'], 2) : 0;
    $menudeo  = isset($postData['menudeo']) ? round((float)$postData['menudeo'], 2) : 0;
    $unitario = isset($postData['unitario']) ? strval(round((float)$postData['unitario'], 2)) : '0';

    if ($prodId > 0) {
        // Update
        $stmtP = $mysqli->prepare("UPDATE productos SET clave = ?, nom_p = ?, des = ?, cant = ? WHERE id = ?");
        $stmtP->bind_param("sssdi", $clave, $nom_p, $des, $cant, $prodId);
        $stmtP->execute();

        // Check if price exists
        $checkPrice = $mysqli->query("SELECT id FROM precios WHERE id_producto = {$prodId}");
        if ($checkPrice && $checkPrice->num_rows > 0) {
            $stmtPr = $mysqli->prepare("UPDATE precios SET mayoreo = ?, medio = ?, menudeo = ?, Unitario = ? WHERE id_producto = ?");
            $stmtPr->bind_param("dddsi", $mayoreo, $medio, $menudeo, $unitario, $prodId);
            $stmtPr->execute();
        } else {
            $stmtPr = $mysqli->prepare("INSERT INTO precios (mayoreo, medio, menudeo, id_producto, Unitario) VALUES (?, ?, ?, ?, ?)");
            $stmtPr->bind_param("dddis", $mayoreo, $medio, $menudeo, $prodId, $unitario);
            $stmtPr->execute();
        }
    } else {
        // Insert new
        $stmtP = $mysqli->prepare("INSERT INTO productos (clave, nom_p, des, cant) VALUES (?, ?, ?, ?)");
        $stmtP->bind_param("sssd", $clave, $nom_p, $des, $cant);
        $stmtP->execute();
        $prodId = $mysqli->insert_id;

        $stmtPr = $mysqli->prepare("INSERT INTO precios (mayoreo, medio, menudeo, id_producto, Unitario) VALUES (?, ?, ?, ?, ?)");
        $stmtPr->bind_param("dddis", $mayoreo, $medio, $menudeo, $prodId, $unitario);
        $stmtPr->execute();
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

// Default response
echo json_encode([
    "success" => true,
    "system" => "Mazal POS & ERP Backend Multi-Sucursal",
    "branch" => $branch,
    "database" => $dbname,
    "message" => "Servidor Apache / XAMPP activo y listo para operar sin internet."
]);
?>
