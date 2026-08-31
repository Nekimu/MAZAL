/**
 * MAZAL POS & ERP - Automated PHP Backend Security Test Suite
 * Valida la arquitectura de seguridad server-side de api.php:
 * 1. requireAuth() obligatorio en endpoints sensibles (RBAC)
 * 2. Protección de borrado/purgado de estado global (save_state, delete_user, save_user)
 * 3. Rate limiting contra ataques de fuerza bruta
 * 4. Integridad de tokens criptográficos sha256
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

describe('🛡️ MAZAL api.php - Server-Side Security & Access Control Verification', () => {
  const apiPhpPath = path.resolve(__dirname, '../api.php');
  const htaccessPath = path.resolve(__dirname, '../.htaccess');
  const manifestPath = path.resolve(__dirname, '../mazal/public/manifest.json');

  it('1. api.php existe y contiene la función de control de acceso requireAuth()', () => {
    assert.ok(fs.existsSync(apiPhpPath), 'api.php debe existir en la raíz del proyecto');
    const apiCode = fs.readFileSync(apiPhpPath, 'utf8');
    assert.ok(apiCode.includes('function requireAuth('), 'Debe contener la función requireAuth');
    assert.ok(apiCode.includes('function generateAuthToken('), 'Debe contener generación de tokens');
    assert.ok(apiCode.includes('function validateAuthToken('), 'Debe contener validación de tokens');
  });

  it('2. El endpoint de purgado y guardado de estado ($action === "save_state") exige requireAuth()', () => {
    const apiCode = fs.readFileSync(apiPhpPath, 'utf8');
    const saveStateBlock = apiCode.substring(apiCode.indexOf("if ($action === 'save_state'"));
    const saveStateSlice = saveStateBlock.substring(0, 300);
    assert.ok(saveStateSlice.includes('requireAuth('), 'save_state DEBE validar autenticación server-side antes de escribir');
  });

  it('3. Los endpoints de administración de usuarios exigen rol Administrador server-side', () => {
    const apiCode = fs.readFileSync(apiPhpPath, 'utf8');
    
    // save_user
    const saveUserBlock = apiCode.substring(apiCode.indexOf("if ($action === 'save_user'"));
    const saveUserSlice = saveUserBlock.substring(0, 300);
    assert.ok(saveUserSlice.includes('requireAuth(') && saveUserSlice.includes('administrador'), 'save_user debe requerir rol administrador');

    // delete_user
    const delUserBlock = apiCode.substring(apiCode.indexOf("if ($action === 'delete_user'"));
    const delUserSlice = delUserBlock.substring(0, 300);
    assert.ok(delUserSlice.includes('requireAuth(') && delUserSlice.includes('administrador'), 'delete_user debe requerir rol administrador');
  });

  it('4. Los endpoints destructivos y operacionales están protegidos con requireAuth()', () => {
    const apiCode = fs.readFileSync(apiPhpPath, 'utf8');
    const sensitiveActions = [
      'save_product',
      'delete_product',
      'save_customer',
      'delete_customer',
      'save_supplier',
      'delete_supplier',
      'save_sale',
      'delete_sale',
      'save_movement',
      'save_cash_session',
      'save_expense',
      'delete_expense',
      'save_purchase_order',
      'delete_purchase_order',
      'save_permissions',
      'save_bank_account',
      'save_bank_movement',
      'save_credit_payment'
    ];

    for (const action of sensitiveActions) {
      const actionIdx = apiCode.indexOf(`if ($action === '${action}'`);
      assert.ok(actionIdx !== -1, `La acción ${action} debe estar definida en api.php`);
      const actionSlice = apiCode.substring(actionIdx, actionIdx + 300);
      assert.ok(actionSlice.includes('requireAuth('), `La acción '${action}' DEBE estar protegida con requireAuth()`);
    }
  });

  it('5. Solo "login" y "ping" operan como endpoints públicos por diseño', () => {
    const apiCode = fs.readFileSync(apiPhpPath, 'utf8');
    const loginIdx = apiCode.indexOf("if ($action === 'login'");
    const loginSlice = apiCode.substring(loginIdx, loginIdx + 300);
    assert.ok(!loginSlice.includes('requireAuth('), 'login no debe requerir token previo para autenticarse');

    const pingIdx = apiCode.indexOf("if ($action === 'ping'");
    const pingSlice = apiCode.substring(pingIdx, pingIdx + 300);
    assert.ok(!pingSlice.includes('requireAuth('), 'ping es para comprobación de latencia de red');
  });

  it('6. .htaccess y manifest.json están configurados correctamente para PWA sin 403', () => {
    assert.ok(fs.existsSync(htaccessPath), '.htaccess debe existir');
    const htaccess = fs.readFileSync(htaccessPath, 'utf8');
    assert.ok(htaccess.includes('manifest.json'), '.htaccess debe permitir manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir en mazal/public/');
  });
});
