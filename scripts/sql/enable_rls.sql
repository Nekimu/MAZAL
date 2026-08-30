-- ==============================================================================
-- MAZAL POS & ERP - HABILITACIÓN DE ROW LEVEL SECURITY (RLS) Y CONTROL DE ACCESOS
-- ==============================================================================
-- Ubicación: scripts/sql/enable_rls.sql
-- 
-- Este script:
-- 1. Habilita RLS en el 100% de las tablas del esquema público.
-- 2. Revoca permisos del rol 'anon' y 'authenticated' en tablas sensibles (users, finanzas, logs).
-- 3. Configura políticas específicas para tablas operativas sincronizadas por el frontend.
-- 4. Garantiza que el backend Node.js (service_role) tenga control total.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HABILITAR RLS EN TODAS LAS TABLAS DE NEGOCIO
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehicles ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roles_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_state ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. LIMPIEZA DE POLÍTICAS PREVIAS PERMISIVAS
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. BLOQUEO TOTAL DE TABLAS CRÍTICAS (Solo accesibles vía Server API con service_role)
-- ------------------------------------------------------------------------------
-- La gestión de usuarios y contraseñas NUNCA debe permitirse desde el cliente anon
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.bank_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.bank_movements FROM anon, authenticated;
REVOKE ALL ON TABLE public.budgets FROM anon, authenticated;
REVOKE ALL ON TABLE public.cost_centers FROM anon, authenticated;
REVOKE ALL ON TABLE public.vehicles FROM anon, authenticated;

-- Políticas denegatorias explícitas para anon/authenticated en usuarios y finanzas
CREATE POLICY "Deny anon access on users" ON public.users FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny anon access on audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny anon access on bank_accounts" ON public.bank_accounts FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny anon access on bank_movements" ON public.bank_movements FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny anon access on budgets" ON public.budgets FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny anon access on cost_centers" ON public.cost_centers FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny anon access on vehicles" ON public.vehicles FOR ALL TO anon, authenticated USING (false);

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS PARA TABLAS OPERATIVAS USADAS EN SINCRONIZACIÓN OFFLINE / POS SPA
-- ------------------------------------------------------------------------------

-- Catálogo de productos: Lectura pública, escritura permitida para inventario
CREATE POLICY "Allow read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow write products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- Clientes y Proveedores
CREATE POLICY "Allow sync customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow sync suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

-- Ventas y Movimientos de Inventario
CREATE POLICY "Allow sync sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow sync stock_movements" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);

-- Sesiones y Gastos de Caja
CREATE POLICY "Allow sync cash_sessions" ON public.cash_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow sync cash_expenses" ON public.cash_expenses FOR ALL USING (true) WITH CHECK (true);

-- Órdenes de Compra
CREATE POLICY "Allow sync purchase_orders" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);

-- Sucursales e Inventario Multi-sucursal
CREATE POLICY "Allow sync branches" ON public.branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow sync branch_inventory" ON public.branch_inventory FOR ALL USING (true) WITH CHECK (true);

-- Permisos de Roles y Estado de la App
CREATE POLICY "Allow read roles_permisos" ON public.roles_permisos FOR SELECT USING (true);
CREATE POLICY "Allow sync app_state" ON public.app_state FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 5. VERIFICACIÓN FINAL DE RLS EN TODAS LAS TABLAS DEL ESQUEMA PÚBLICO
-- ------------------------------------------------------------------------------
SELECT 
    tablename, 
    rowsecurity AS "RLS Habilitado (Debe ser TRUE)" 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
