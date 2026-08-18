#!/usr/bin/env node
/**
 * MAZAL POS & ERP - Pre-commit Secret Detector Hook
 * Escanea archivos staged en Git para prevenir la fuga accidental de credenciales o secretos.
 */

const { execSync } = require('child_process');
const fs = require('fs');

// Patrones de secretos prohibidos en código
const SECRET_PATTERNS = [
  { name: 'Supabase Real Anon/Publishable Key', regex: /sb_publishable_[0-9A-Za-z-_]+/ },
  { name: 'Firebase API Key', regex: /AIzaSy[0-9A-Za-z-_]{33}/ },
  { name: 'Hardcoded Supabase Project URL', regex: /https:\/\/[a-z0-9]{20}\.supabase\.co/ },
  { name: 'Postgres Connection String with Password', regex: /postgresql:\/\/[^:]+:[^@\s]+@aws-[0-9]/ },
  { name: 'Hardcoded Admin Plaintext Password in code', regex: /"password"\s*:\s*"(admin|1234|123456|mazal2026)"/i },
  { name: 'RSA/EC/OpenSSL Private Key', regex: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: 'JWT Secret Hardcoded', regex: /JWT_SECRET\s*=\s*["'][a-zA-Z0-9]{32,}["']/ }
];

// Archivos o extensiones permitidas a ignorar
const IGNORED_FILES = [
  'package-lock.json',
  '.env.example',
  'check-secrets.js',
  'README.md'
];

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
    return output.split('\n').map(f => f.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function main() {
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  let foundSecrets = 0;

  for (const file of stagedFiles) {
    if (IGNORED_FILES.some(ignored => file.endsWith(ignored))) {
      continue;
    }

    if (!fs.existsSync(file)) continue;

    const stats = fs.statSync(file);
    if (stats.size > 2 * 1024 * 1024) {
      // Ignorar archivos mayores a 2MB (ej. bundles grandes)
      continue;
    }

    let content = '';
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (e) {
      continue; // Archivo binario
    }

    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      // Permitir comentarios con "placeholder", "example", "tu-proyecto"
      if (line.includes('placeholder') || line.includes('tu-proyecto') || line.includes('your-project') || line.includes('change-me')) {
        continue;
      }

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          console.error(`\n🚨 [SEGURIDAD] Se detectó un posible secreto en staged files:`);
          console.error(`   📁 Archivo: ${file}:${lineNum + 1}`);
          console.error(`   ⚠️ Tipo:    ${pattern.name}`);
          console.error(`   🔍 Línea:   ${line.trim().substring(0, 100)}...`);
          foundSecrets++;
        }
      }
    }
  }

  if (foundSecrets > 0) {
    console.error(`\n❌ COMMIT CANCELADO: Se detectaron ${foundSecrets} posibles credenciales en staged files.`);
    console.error(`👉 Usa variables de entorno (.env) y placeholders en archivos de ejemplo (.env.example).`);
    console.error(`👉 Si es un falso positivo justificado, usa git commit --no-verify\n`);
    process.exit(1);
  }

  console.log(`✅ [Seguridad] Escaneo de secretos completado: 0 credenciales expuestas en ${stagedFiles.length} archivos.`);
  process.exit(0);
}

main();
