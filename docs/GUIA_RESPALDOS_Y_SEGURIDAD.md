# 🛡️ MAZAL POS & ERP — Guía de Seguridad y Respaldos Locales (XAMPP / Apache / MySQL)

Este documento describe la arquitectura de seguridad aplicada al backend PHP (`api.php`), la base de datos MySQL local (`mazal_bd`), las directivas de Apache y el plan de contingencia y respaldos automáticos sin dependencia de la nube.

---

## 1. Configuración de Usuario MySQL Seguro y `config.php`

Por defecto, XAMPP se distribuye con el usuario `root` y contraseña vacía. En un entorno de producción local con datos de negocio reales, **nunca** se debe usar `root` sin clave.

### Paso 1: Crear Usuario MySQL Dedicado
En la consola de MySQL o en phpMyAdmin (pestaña SQL), ejecuta:

```sql
-- 1. Crear el usuario para la aplicación MAZAL
CREATE USER IF NOT EXISTS 'mazal_app'@'localhost' IDENTIFIED BY 'TuPasswordSeguraAqui!2026';

-- 2. Conceder privilegios limitados estrictamente a la base de datos mazal_bd
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, DROP, REFERENCES, LOCK TABLES ON `mazal_bd`.* TO 'mazal_app'@'localhost';

-- 3. Aplicar cambios
FLUSH PRIVILEGES;
```

### Paso 2: Crear el archivo `config.php`
Copia el archivo de plantilla `config.example.php` como `config.php`:

```bash
cp config.example.php config.php
```

Configura tus credenciales en `config.php`:
```php
<?php
return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_user' => 'mazal_app',
    'db_pass' => 'TuPasswordSeguraAqui!2026',
    'db_name' => 'mazal_bd',
    'allowed_origins' => [
        'http://localhost',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
    ]
];
```

> **Nota:** El archivo `config.php` está protegido en `.gitignore` y por directivas de Apache en `.htaccess`, evitando que se exponga o se suba a repositorios.

---

## 2. Protección de phpMyAdmin en Apache / XAMPP

Para evitar que otras máquinas de la red local accedan a phpMyAdmin:

1. Abre el archivo de configuración de Apache en XAMPP:
   `C:\xampp\apache\conf\extra\httpd-xampp.conf`
2. Localiza el bloque `<Directory "C:/xampp/phpMyAdmin/">`:
   ```apache
   <Directory "C:/xampp/phpMyAdmin/">
       AllowOverride AuthConfig
       Require local
       ErrorDocument 403 /error/XAMPP_FORBIDDEN.html.var
   </Directory>
   ```
3. Asegúrate de que tenga la directiva `Require local` (o `Require ip 127.0.0.1`) para restringir el acceso únicamente a la máquina física anfitriona.
4. Reinicia el servicio Apache desde el panel de XAMPP.

---

## 3. Manejo de Errores y Cabeceras de Seguridad

### Errores Seguros
- Todas las excepciones y fallas de base de datos se registran en `logs/api_errors.log` y en el log interno de PHP (`error_log`) con timestamp, IP, acción y stack trace.
- Al cliente solo se le devuelve una respuesta estandarizada:
  ```json
  {
    "success": false,
    "error": "Ocurrió un error interno. Intenta de nuevo."
  }
  ```

### Cabeceras HTTP de Seguridad
En cada respuesta de `api.php` y en `.htaccess` se emiten:
- `X-Content-Type-Options: nosniff` (previene MIME sniffing)
- `X-Frame-Options: SAMEORIGIN` (mitiga clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Access-Control-Allow-Origin` restringido por whitelist dinámica (sin wildcard `*` indiscriminado).

---

## 4. Auditoría Local (`auditoria`)

Las acciones críticas se registran en la tabla local `auditoria`:
- Intentos de inicio de sesión (exitosos y fallidos con IP).
- Creación, modificación y eliminación de usuarios.
- Cambios en la matriz de permisos de roles.
- Cancelación o eliminación de ventas, productos, gastos, órdenes de compra y clientes.

Para consultar los eventos de auditoría:
```sql
SELECT id, user_name, role, action, details, ip, timestamp 
FROM auditoria 
ORDER BY timestamp DESC 
LIMIT 50;
```

---

## 5. Estrategia de Respaldos Automáticos y Rotación (14 días)

Dado que la base de datos reside en la máquina local, es **obligatorio** contar con un mecanismo de respaldo diario automático.

### Scripts Disponibles:
- `scripts/backup_mysql.bat` (Para Windows / Task Scheduler)
- `scripts/backup_mysql.ps1` (Para PowerShell)
- `scripts/backup_mysql.sh` (Para Linux / macOS / Cron)

### Programar Tarea Automática en Windows:
1. Presiona `Win + R`, escribe `taskschd.msc` y presiona Enter.
2. Clic en **Crear tarea básica...**
   - **Nombre:** `MAZAL_Respaldo_Diario_MySQL`
   - **Desencadenador:** Diariamente a las **22:00** hrs (o al cierre de turno).
   - **Acción:** Iniciar un programa.
   - **Programa o script:** `C:\xampp\htdocs\MAZAL\scripts\backup_mysql.bat` (o tu ruta correspondiente).
   - **Iniciar en:** `C:\xampp\htdocs\MAZAL\scripts\`
3. Finalizar y marcar la casilla "Ejecutar tanto si el usuario inició sesión como si no".

### Rotación de Respaldos:
Los scripts eliminan automáticamente archivos de respaldo con más de 14 días de antigüedad para no saturar el almacenamiento, garantizando un historial de 2 semanas de recuperación ante desastres.

> **Recomendación:** Se sugiere sincronizar la carpeta `backups/` con un servicio de almacenamiento en la nube externo (como Google Drive para Escritorio o OneDrive) o copiarla a una memoria USB semanalmente.

---

## 6. Procedimiento de Restauración de un Respaldo

Si se requiere restaurar la base de datos `mazal_bd` a un punto anterior:

### Método 1: Por Consola de Comandos
```bash
# 1. Abrir la terminal y navegar a la carpeta de respaldos
cd C:\xampp\htdocs\MAZAL\backups

# 2. Restaurar el archivo deseado en mazal_bd
mysql -u mazal_app -p -h 127.0.0.1 mazal_bd < mazal_bd_2026-08-30_220000.sql
```

### Método 2: Desde phpMyAdmin
1. Entra a `http://localhost/phpmyadmin/`
2. Selecciona la base de datos `mazal_bd` en el panel izquierdo.
3. Ve a la pestaña **Importar**.
4. Selecciona el archivo `.sql` desde la carpeta `backups/`.
5. Clic en **Importar** al final de la página.
