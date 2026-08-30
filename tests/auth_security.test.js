/**
 * MAZAL POS & ERP - Automated Security & Auth Test Suite
 * Ejecutar con: npm test  (o node --test tests/auth_security.test.js)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Asegurar entorno de pruebas
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-security-secret-key-64-bytes-00000000000000000000000000000000';

const app = require('../server');

describe('🔒 MAZAL POS & ERP - Security & Authentication Verification', () => {
  const JWT_SECRET = process.env.JWT_SECRET;
  
  const adminToken = jwt.sign(
    { userId: 'USR_ADMIN', username: 'admin', name: 'Administrador General', role: 'Administrador' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const cashierToken = jwt.sign(
    { userId: 'USR_CAJERO', username: 'cajero1', name: 'Cajero Turno', role: 'Cajero' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  describe('1. Verificación de Endpoints Públicos', () => {
    it('GET /health debe ser accesible sin autenticación', async () => {
      const res = await request(app).get('/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'OK');
    });

    it('GET /api/health debe ser accesible sin autenticación', async () => {
      const res = await request(app).get('/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'healthy');
    });

    it('GET /api/config debe ser accesible públicamente', async () => {
      const res = await request(app).get('/api/config');
      assert.strictEqual(res.status, 200);
      assert.ok('supabaseUrl' in res.body);
    });
  });

  describe('2. Eliminación de Bypasses de Autenticación en /api/auth/login', () => {
    it('(a) Login con password incorrecto debe responder 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: 'wrongpassword123' });
      
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, 'Credenciales inválidas. Verifica tu usuario y contraseña.');
    });

    it('(b) Login con "admin" y contraseña errónea DEBE FALLAR con 401 (Bypass eliminado)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'clave_completamente_falsa_999' });
      
      assert.strictEqual(res.status, 401);
      assert.ok(!res.body.token, 'No debe retornar token con credencial errónea');
    });

    it('(b2) Login con "admin" / "admin030114" DEBE FALLAR con 401 si no coincide con hash real (Bypass eliminado)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin030114' });
      
      assert.strictEqual(res.status, 401);
      assert.ok(!res.body.token, 'No debe retornar token con bypass admin030114');
    });

    it('Login sin usuario o contraseña debe responder 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: '', password: '' });
      
      assert.strictEqual(res.status, 400);
    });
  });

  describe('3. Protección de Endpoints /api/users (RBAC)', () => {
    it('(c) GET /api/users sin token debe responder 401 Unauthorized', async () => {
      const res = await request(app).get('/api/users');
      assert.strictEqual(res.status, 401);
      assert.ok(res.body.error.includes('Token de autenticación requerido'));
    });

    it('(c2) POST /api/users sin token debe responder 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ username: 'nuevo_usuario', name: 'Nuevo', role: 'Cajero' });
      
      assert.strictEqual(res.status, 401);
    });

    it('(c3) DELETE /api/users/:username sin token debe responder 401 Unauthorized', async () => {
      const res = await request(app).delete('/api/users/usuario_prueba');
      assert.strictEqual(res.status, 401);
    });

    it('(d) Usuario con rol "Cajero" NO puede listar ni crear usuarios (403 Forbidden)', async () => {
      const resGet = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${cashierToken}`);
      
      assert.strictEqual(resGet.status, 403);
      assert.ok(resGet.body.error.includes('Permisos insuficientes'));

      const resPost = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ username: 'hacker_admin', name: 'Hacker', role: 'Administrador' });
      
      assert.strictEqual(resPost.status, 403);
    });

    it('Usuario con rol "Administrador" tiene acceso autorizado a /api/users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      // Si Supabase no está conectado en entorno local de test, responde 200 con array vacío
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.users));
    });

    it('(e) POST /api/users con rol no permitido en whitelist debe responder 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'usuario_invalido',
          name: 'Usuario Invalido',
          role: 'SuperHackerInvalido'
        });
      
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('Rol inválido especificado'));
    });
  });

  describe('4. Validación de Sesión: GET /api/auth/me', () => {
    it('GET /api/auth/me con token válido retorna los datos del payload decodificado', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.username, 'admin');
      assert.strictEqual(res.body.user.role, 'Administrador');
    });

    it('GET /api/auth/me con token adulterado responde 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token_invalido_totalmente_falso');
      
      assert.strictEqual(res.status, 401);
    });
  });
});
