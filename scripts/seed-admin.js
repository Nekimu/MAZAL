#!/usr/bin/env node
/**
 * MAZAL POS & ERP - Script Seguro de Inicialización de Administrador
 * 
 * Uso: node scripts/seed-admin.js
 * 
 * Este script:
 * 1. Genera una contraseña aleatoria de alta entropía con crypto.randomBytes.
 * 2. Genera el hash Bcrypt seguro (12 rondas).
 * 3. Inserta o actualiza el usuario 'admin' en la tabla 'users' de Supabase Cloud.
 * 4. Imprime la contraseña temporal en la terminal para el administrador.
 * 5. NUNCA almacena la contraseña en texto plano en archivos ni en el repositorio.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno desde .env si existe
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('your-project') || SUPABASE_URL.includes('placeholder')) {
  console.error('\n❌ ERROR: Se requieren credenciales válidas de Supabase en .env (VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_ANON_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function seedAdmin() {
  console.log('\n===============================================================');
  console.log('   🛡️  MAZAL POS & ERP — INICIALIZACIÓN SEGURA DE ADMINISTRADOR ');
  console.log('===============================================================');
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  
  // 1. Generar contraseña aleatoria criptográfica segura (16 bytes = 22 caracteres base64url)
  const generatedPassword = crypto.randomBytes(16).toString('base64url');
  
  // 2. Hashear con Bcrypt (cost factor 12)
  console.log('⏳ Generando hash Bcrypt seguro (12 rounds)...');
  const passwordHash = await bcrypt.hash(generatedPassword, 12);
  
  // 3. Upsert en tabla users de Supabase
  console.log('⏳ Registrando usuario @admin en Supabase Cloud...');
  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: 'USR_ADMIN',
      username: 'admin',
      name: 'Administrador General',
      password: '', // Sin texto plano
      password_hash: passwordHash,
      role: 'Administrador',
      status: 'Activo',
      created_at: new Date().toISOString()
    }, { onConflict: 'username' })
    .select('id, username, name, role, status')
    .single();

  if (error) {
    console.error('\n❌ Error al guardar usuario administrador en Supabase:', error.message);
    process.exit(1);
  }

  console.log('\n✅ ¡Usuario Administrador inicializado exitosamente en Supabase Cloud!');
  console.log('---------------------------------------------------------------');
  console.log(`👤 Usuario:     admin`);
  console.log(`🔑 Contraseña:  ${generatedPassword}`);
  console.log(`🛡️ Rol:         Administrador`);
  console.log(`📊 Estado:      Activo`);
  console.log('---------------------------------------------------------------');
  console.log('⚠️  IMPORTANTE:');
  console.log('   1. Guarda esta contraseña inmediatamente en un gestor de contraseñas.');
  console.log('   2. Esta contraseña NO ha sido guardada en ningún archivo ni en git.');
  console.log('   3. Cámbiala tras tu primer inicio de sesión desde el módulo de seguridad.');
  console.log('===============================================================\n');
}

seedAdmin().catch((err) => {
  console.error('❌ Excepción inesperada:', err);
  process.exit(1);
});
