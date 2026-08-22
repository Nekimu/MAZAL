/**
 * MAZAL POS & ERP - Production Web Server for Railway & Cloud Hosting
 * Incluye Autenticación Server-Side Segura (Bcrypt + JWT) y Middleware de Protección.
 */
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de JWT Secret (Requerido en producción)
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' 
  ? (() => {
      console.warn('⚠️ ADVERTENCIA CRÍTICA: JWT_SECRET no está definido en variables de entorno. Generando clave temporal.');
      return require('crypto').randomBytes(64).toString('hex');
    })()
  : 'mazal-pos-dev-secret-key-2026-secure-token');

// Cliente Supabase Server-Side
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
  console.log('[MAZAL POS Server] Modo local/desarrollo activo (Credenciales de Supabase no configuradas o con placeholders).');
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

// 2. Healthcheck Endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    app: 'MAZAL POS & ERP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: supabase ? 'connected' : 'local_fallback' });
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

// 4. Endpoint Server-Side de Autenticación: POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  if (!cleanUser || !cleanPass) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    let targetUser = null;

    // Bloqueo estricto e incondicional de contraseñas débiles para admin
    if (cleanUser === 'admin' && (cleanPass === 'admin' || cleanPass === '1234' || cleanPass === 'password' || cleanPass === 'admin123')) {
      return res.status(401).json({ error: 'Credenciales inválidas. Acceso denegado.' });
    }

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

    // Fallback maestro de contingencia para Administrador General exclusivamente con admin030114
    if (!targetUser && cleanUser === 'admin') {
      const defaultAdminPass = process.env.VITE_USER_ADMIN_PASSWORD || 'admin030114';
      if (cleanPass === defaultAdminPass && cleanPass !== 'admin') {
        targetUser = {
          id: 'USER_ADMIN_DEFAULT',
          username: 'admin',
          name: 'Administrador General',
          role: 'Administrador',
          status: 'Activo',
          password_hash: null
        };
      }
    }

    // Si el usuario no existe, responder 401 genérico
    if (!targetUser) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu usuario y contraseña.' });
    }

    // Verificar si la cuenta está inactiva
    if (targetUser.status === 'Inactivo') {
      return res.status(403).json({ error: 'Esta cuenta se encuentra inactiva. Contacta al Administrador.' });
    }

    let passwordMatch = false;

    if (targetUser.password_hash) {
      // Comparar contra hash bcrypt existente
      passwordMatch = await bcrypt.compare(cleanPass, targetUser.password_hash);
    } else if (targetUser.password) {
      // Migración automática (legacy plaintext -> bcrypt hash)
      if (targetUser.password === cleanPass) {
        passwordMatch = true;
        try {
          const newHash = await bcrypt.hash(cleanPass, 12);
          if (supabase && targetUser.id) {
            await supabase
              .from('users')
              .update({ password_hash: newHash, password: '' })
              .eq('id', targetUser.id);
          }
        } catch (hashErr) {
          console.warn('[Auth Server] Error al actualizar password_hash:', hashErr.message);
        }
      }
    } else if (targetUser.id === 'USER_ADMIN_DEFAULT') {
      passwordMatch = true;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu usuario y contraseña.' });
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
    if (supabase && targetUser.id && targetUser.id !== 'USER_ADMIN_DEFAULT') {
      supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', targetUser.id)
        .then(() => {})
        .catch(() => {});
    }

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

// 5. Endpoint para verificar sesión activa: GET /api/auth/me
app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

// 6. Configuración de Archivos Estáticos (Frontend SPA)
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
  etag: true
}));

// SPA Fallback: redirigir cualquier otra ruta a index.html
app.get('*', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('MAZAL POS: La compilación del frontend no se encuentra. Ejecuta npm run build.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🚀 MAZAL POS & ERP SERVIDOR ACTIVO EN LÍNEA`);
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL Local: http://localhost:${PORT}`);
  console.log(`🔒 Autenticación Server-Side: Bcrypt + JWT Activo`);
  console.log(`=================================================`);
});
