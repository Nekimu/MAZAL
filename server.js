/**
 * MAZAL POS & ERP - Production Web Server for Railway & Cloud Hosting
 * Incluye Autenticación Server-Side Segura (Bcrypt + SHA256 Compat + JWT),
 * Gestión de Usuarios con RBAC, Rate Limiting, Entrega Dinámica de Configuración e Inyección SPA.
 */
require('dotenv').config();

if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_STATIC_URL) {
  console.log('[MAZAL] server.js no es necesario en modo 100% local XAMPP. Usa api.php + Apache.');
}

const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de JWT Secret (Requerido en producción)
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' 
  ? (() => {
      console.warn('⚠️ ADVERTENCIA CRÍTICA: JWT_SECRET no está definido en variables de entorno. Generando clave temporal.');
      return crypto.randomBytes(64).toString('hex');
    })()
  : 'mazal-pos-dev-secret-key-2026-secure-token');

// Cliente Supabase Server-Side (Configurado estrictamente mediante variables de entorno)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project') && !SUPABASE_URL.includes('placeholder')) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    console.log('[MAZAL POS Server] Supabase Server Client conectado exitosamente.');
  } catch (err) {
    console.warn('[MAZAL POS Server] No se pudo inicializar cliente Supabase:', err.message);
  }
} else {
  console.log('[MAZAL POS Server] Modo local/desarrollo activo (Credenciales de Supabase se obtendrán desde variables de entorno).');
}

// Whitelist de roles permitidos en el sistema
const ALLOWED_ROLES = ['Administrador', 'Gerente', 'Cajero', 'Almacen', 'Compras', 'Contador'];

function validateAndNormalizeRole(role) {
  if (!role) return null;
  const match = ALLOWED_ROLES.find(r => r.toLowerCase() === String(role).trim().toLowerCase());
  return match || null;
}

// 1. Middlewares de Seguridad y Parsing
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Rate Limiter específico para Login (máximo 5 intentos por IP cada 15 minutos)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Límite de 5 intentos por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos fallidos de inicio de sesión. Por favor intenta de nuevo en 15 minutos.'
  }
});

// Función de registro de auditoría de autenticación
async function logAuthAttempt(username, success, ip, details = '') {
  const timestamp = new Date().toISOString();
  console.log(`[AUTH LOG] ${timestamp} | IP: ${ip} | User: @${username} | Status: ${success ? 'SUCCESS' : 'FAILED'} | ${details}`);
  
  if (supabase) {
    try {
      await supabase.from('audit_logs').insert({
        id: `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_name: username || 'desconocido',
        role: success ? 'Autenticado' : 'Sin Sesión',
        action: success ? 'Login Exitoso' : 'Login Fallido',
        details: `${details} (IP: ${ip})`,
        timestamp,
        ip: ip || 'unknown',
        branch: 'Server-API'
      });
    } catch (logErr) {
      // Non-blocking log insertion failure
    }
  }
}

// 2. Healthcheck & Config Endpoints (Públicos)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    app: 'MAZAL POS & ERP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    database: supabase ? 'connected' : 'local_fallback',
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project'))
  });
});

// Endpoint público para que los clientes obtengan URL en runtime
app.get('/api/config', (req, res) => {
  res.status(200).json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  });
});

// 3. Middleware de Autenticación JWT (requireAuth)
function requireAuth(allowedRoles) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acceso no autorizado: Token de autenticación requerido.' });
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length > 0) {
        const userRole = (decoded.role || '').toLowerCase();
        const hasRole = allowedRoles.some(r => r.toLowerCase() === userRole || userRole === 'admin' || userRole === 'administrador');
        if (!hasRole) {
          return res.status(403).json({ error: 'Permisos insuficientes para realizar esta operación.' });
        }
      }

      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado. Por favor inicia sesión nuevamente.' });
    }
  };
}

/**
 * Función auxiliar para verificar contraseñas en múltiples formatos
 * (Bcrypt, SHA-256 hexadecimal, o texto plano legado con auto-migración)
 * NINGÚN ID NI USUARIO POSEE BYPASS AUTOMÁTICO.
 */
async function verifyUserPassword(cleanPass, targetUser) {
  const sha256Hex = crypto.createHash('sha256').update(cleanPass).digest('hex');
  let match = false;
  let shouldRehash = false;

  // 1. Si targetUser.password_hash tiene formato Bcrypt ($2a$, $2b$, $2y$)
  if (targetUser.password_hash && /^\$2[aby]\$\d+\$/.test(targetUser.password_hash)) {
    try {
      match = await bcrypt.compare(cleanPass, targetUser.password_hash);
    } catch (e) {
      match = false;
    }
  } 
  // 2. Si targetUser.password_hash es un hash SHA-256 (64 caracteres hexadecimales)
  else if (targetUser.password_hash && /^[a-f0-9]{64}$/i.test(targetUser.password_hash)) {
    if (targetUser.password_hash.toLowerCase() === sha256Hex.toLowerCase()) {
      match = true;
      shouldRehash = true;
    }
  }
  // 3. Comparación con texto plano legado en password o password_hash
  else if (targetUser.password && targetUser.password === cleanPass) {
    match = true;
    shouldRehash = true;
  } else if (targetUser.password_hash && targetUser.password_hash === cleanPass) {
    match = true;
    shouldRehash = true;
  }

  // Si no coincidió aún pero targetUser.password tiene hash SHA-256
  if (!match && targetUser.password && /^[a-f0-9]{64}$/i.test(targetUser.password)) {
    if (targetUser.password.toLowerCase() === sha256Hex.toLowerCase()) {
      match = true;
      shouldRehash = true;
    }
  }

  return { match, shouldRehash };
}

// 4. Endpoint Server-Side de Autenticación: POST /api/auth/login (Protegido con Rate Limiting)
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const { username, password } = req.body || {};
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  if (!cleanUser || !cleanPass) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    let targetUser = null;

    if (supabase) {
      // Consultar usuario en base de datos Supabase
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .ilike('username', cleanUser)
        .maybeSingle();

      if (!error && data) {
        targetUser = data;
      }
    }

    // Si el usuario no existe, responder 401 genérico y registrar intento fallido
    if (!targetUser) {
      await logAuthAttempt(cleanUser, false, clientIp, 'Usuario no encontrado');
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu usuario y contraseña.' });
    }

    // Verificar si la cuenta está inactiva
    if (targetUser.status === 'Inactivo') {
      await logAuthAttempt(cleanUser, false, clientIp, 'Cuenta inactiva');
      return res.status(403).json({ error: 'Esta cuenta se encuentra inactiva. Contacta al Administrador.' });
    }

    // Verificación estricta de contraseña (Bcrypt / SHA-256) - SIN BYPASS NI FALLBACKS HARDCODEADOS
    const { match: passwordMatch, shouldRehash } = await verifyUserPassword(cleanPass, targetUser);

    if (!passwordMatch) {
      await logAuthAttempt(cleanUser, false, clientIp, 'Contraseña incorrecta');
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu usuario y contraseña.' });
    }

    // Auto-migración a Bcrypt seguro si se logueó con SHA-256 o texto plano
    if (shouldRehash && supabase && targetUser.id) {
      try {
        const newBcryptHash = await bcrypt.hash(cleanPass, 12);
        await supabase
          .from('users')
          .update({ password_hash: newBcryptHash, password: '' })
          .eq('id', targetUser.id);
        console.log(`[Auth Server] Contraseña de @${cleanUser} migrada a hash Bcrypt con éxito.`);
      } catch (hashErr) {
        console.warn('[Auth Server] Aviso al auto-migrar hash:', hashErr.message);
      }
    }

    // Generar token JWT con expiración de 12 horas
    const tokenPayload = {
      userId: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      role: targetUser.role
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    // Actualizar timestamp de última conexión
    if (supabase && targetUser.id) {
      supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', targetUser.id)
        .then(() => {})
        .catch(() => {});
    }

    await logAuthAttempt(cleanUser, true, clientIp, 'Autenticación exitosa');

    // Responder con token y datos de usuario (SIN password ni password_hash)
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        name: targetUser.name,
        role: targetUser.role,
        status: targetUser.status || 'Activo'
      }
    });

  } catch (err) {
    console.error('[Auth Server] Error inesperado en /api/auth/login:', err);
    return res.status(500).json({ error: 'Error interno del servidor al procesar la autenticación.' });
  }
});

// 5. Endpoint para verificar sesión activa: GET /api/auth/me (Requiere Token)
app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

// 6. Endpoints Server-Side Protegidos para Gestión de Usuarios (Solo Administrador)
app.get('/api/users', requireAuth(['Administrador']), async (req, res) => {
  if (!supabase) {
    return res.status(200).json({ success: true, users: [] });
  }
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, name, role, status, last_login, created_at')
      .order('name', { ascending: true });

    if (error) throw error;
    return res.status(200).json({ success: true, users: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al obtener usuarios' });
  }
});

app.post('/api/users', requireAuth(['Administrador']), async (req, res) => {
  const { id, username, name, password, role, status } = req.body || {};
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  if (!cleanUser || !name) {
    return res.status(400).json({ error: 'Nombre y usuario son requeridos.' });
  }

  // Validación de Whitelist de Roles
  const normalizedRole = validateAndNormalizeRole(role || 'Cajero');
  if (!normalizedRole) {
    return res.status(400).json({
      error: `Rol inválido especificado. Roles válidos permitidos: ${ALLOWED_ROLES.join(', ')}`
    });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase no está conectado en el servidor.' });
  }

  try {
    let passwordHash = null;
    if (cleanPass) {
      passwordHash = await bcrypt.hash(cleanPass, 12);
    }

    const userId = id || `USER_${cleanUser.toUpperCase()}`;
    const userPayload = {
      id: userId,
      username: cleanUser,
      name: name.trim(),
      role: normalizedRole,
      status: status === 'Inactivo' ? 'Inactivo' : 'Activo',
      ...(passwordHash ? { password_hash: passwordHash, password: '' } : {})
    };

    const { data, error } = await supabase
      .from('users')
      .upsert(userPayload, { onConflict: 'username' })
      .select('id, username, name, role, status')
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      user: {
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        status: data.status
      }
    });
  } catch (err) {
    console.error('[API Users] Error creando/actualizando usuario:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar usuario' });
  }
});

app.delete('/api/users/:username', requireAuth(['Administrador']), async (req, res) => {
  const username = (req.params.username || '').trim().toLowerCase();
  if (username === 'admin') {
    return res.status(403).json({ error: 'No se puede eliminar el usuario administrador maestro.' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase no está conectado.' });
  }

  try {
    const { error } = await supabase.from('users').delete().ilike('username', username);
    if (error) throw error;
    return res.status(200).json({ success: true, message: `Usuario @${username} eliminado.` });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al eliminar usuario' });
  }
});

// 7. Configuración de Archivos Estáticos e Inyección Dinámica SPA
let staticDir = path.join(__dirname, 'mazal', 'dist');
if (!fs.existsSync(staticDir)) {
  staticDir = path.join(__dirname, 'dist');
}
if (!fs.existsSync(staticDir)) {
  staticDir = __dirname;
}

console.log(`[MAZAL POS Server] Sirviendo archivos estáticos desde: ${staticDir}`);
app.use(express.static(staticDir, {
  maxAge: '1d',
  etag: true,
  index: false // Manejamos index.html dinámicamente abajo para inyectar config
}));

// Servir index.html con inyección de configuración en runtime
function serveInjectedIndex(res) {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    const configScript = `<script>window.__MAZAL_CONFIG__ = { supabaseUrl: ${JSON.stringify(SUPABASE_URL)}, supabaseAnonKey: ${JSON.stringify(anonKey)} };</script>`;
    
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${configScript}</head>`);
    } else {
      html = configScript + html;
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } else {
    res.status(404).send('MAZAL POS: La compilación del frontend no se encuentra. Ejecuta npm run build.');
  }
}

app.get('/', (req, res) => {
  serveInjectedIndex(res);
});

// SPA Fallback: redirigir cualquier otra ruta a index.html inyectado
app.get('*', (req, res) => {
  serveInjectedIndex(res);
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 MAZAL POS & ERP SERVIDOR ACTIVO EN LÍNEA`);
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`🌐 URL Local: http://localhost:${PORT}`);
    console.log(`🔒 Autenticación Server-Side: Bcrypt + JWT + Rate Limiting Activo`);
    console.log(`☁️ Supabase Cloud: ${supabase ? 'CONECTADO ✅' : 'PENDIENTE ⚠️'}`);
    console.log(`=================================================`);
  });
}

module.exports = app;
