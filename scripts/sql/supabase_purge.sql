-- ==============================================================================
-- MAZAL POS & ERP - PURGADO TOTAL DE SUPABASE CLOUD (BASE DE DATOS LIMPIA)
-- ==============================================================================
-- Ubicación: scripts/sql/supabase_purge.sql
-- Este script vacía todos los catálogos y transacciones dejando ÚNICAMENTE
-- el usuario Administrador General (admin / admin030114) y la estructura limpia.
-- ==============================================================================

-- 1. TRUNCAR TABLAS TRANSACCIONALES Y CATÁLOGOS
TRUNCATE TABLE public.products CASCADE;
TRUNCATE TABLE public.customers CASCADE;
TRUNCATE TABLE public.suppliers CASCADE;
TRUNCATE TABLE public.sales CASCADE;
TRUNCATE TABLE public.stock_movements CASCADE;
TRUNCATE TABLE public.cash_sessions CASCADE;
TRUNCATE TABLE public.cash_expenses CASCADE;
TRUNCATE TABLE public.purchase_orders CASCADE;
TRUNCATE TABLE public.branch_inventory CASCADE;
TRUNCATE TABLE public.bank_movements CASCADE;
TRUNCATE TABLE public.audit_logs CASCADE;
TRUNCATE TABLE public.app_state CASCADE;

-- 2. LIMPIAR USUARIOS NO ADMINISTRADORES
DELETE FROM public.users WHERE username != 'admin';

-- 3. ASEGURAR CREDENCIALES DEL ADMINISTRADOR GENERAL
INSERT INTO public.users (id, username, name, password, role, status)
VALUES ('USR_ADMIN', 'admin', 'Administrador General', 'admin030114', 'Administrador', 'Activo')
ON CONFLICT (username) DO UPDATE SET 
    role = 'Administrador',
    status = 'Activo';

-- 4. CONFIRMAR PURGADO
SELECT 'PURGADO COMPLETADO' AS status, count(*) AS total_usuarios_restantes FROM public.users;
