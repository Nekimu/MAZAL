-- ==============================================================================
-- MAZAL POS & ERP - SUPABASE POSTGRESQL DATABASE SCHEMA MIGRATION
-- Compatible con Supabase Cloud (PostgreSQL 15+ / PostgREST / Realtime)
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE PRODUCTOS (CATÁLOGO MAESTRO)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    code TEXT,
    barcode TEXT,
    sku TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    subcategory TEXT,
    unit TEXT DEFAULT 'pz',
    cost NUMERIC(12, 2) DEFAULT 0,
    price_min NUMERIC(12, 2) DEFAULT 0,
    price_med NUMERIC(12, 2) DEFAULT 0,
    price_max NUMERIC(12, 2) DEFAULT 0,
    price_special NUMERIC(12, 2) DEFAULT 0,
    stock NUMERIC(12, 3) DEFAULT 0,
    stock_min NUMERIC(12, 3) DEFAULT 0,
    stock_max NUMERIC(12, 3) DEFAULT 100,
    location TEXT DEFAULT 'Bodega Principal',
    is_compound BOOLEAN DEFAULT false,
    image_url TEXT,
    supplier_id TEXT,
    sucursal TEXT DEFAULT 'Norte',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products (code);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products (name);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);
CREATE INDEX IF NOT EXISTS idx_products_sucursal ON public.products (sucursal);

-- 3. TABLA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    rfc TEXT,
    role TEXT DEFAULT 'Cliente Normal',
    credit_limit NUMERIC(12, 2) DEFAULT 0,
    credit_used NUMERIC(12, 2) DEFAULT 0,
    credit_days INT DEFAULT 30,
    notes TEXT,
    status TEXT DEFAULT 'Activo',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);

-- 4. TABLA DE PROVEEDORES
CREATE TABLE IF NOT EXISTS public.suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    rfc TEXT,
    outstanding_balance NUMERIC(12, 2) DEFAULT 0,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA DE VENTAS / TICKETS
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY,
    ticket_number TEXT NOT NULL,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cost_total NUMERIC(12, 2) DEFAULT 0,
    profit NUMERIC(12, 2) DEFAULT 0,
    payment_method TEXT DEFAULT 'Efectivo',
    customer_id TEXT,
    customer_name TEXT,
    user_id TEXT,
    user_name TEXT,
    date TEXT NOT NULL,
    amount_paid NUMERIC(12, 2) DEFAULT 0,
    change NUMERIC(12, 2) DEFAULT 0,
    sucursal TEXT DEFAULT 'Norte',
    items JSONB DEFAULT '[]'::jsonb,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_ticket ON public.sales (ticket_number);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales (date);
CREATE INDEX IF NOT EXISTS idx_sales_sucursal ON public.sales (sucursal);

-- 6. TABLA DE MOVIMIENTOS DE INVENTARIO (KARDEX)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT,
    type TEXT NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL,
    previous_stock NUMERIC(12, 3) DEFAULT 0,
    new_stock NUMERIC(12, 3) DEFAULT 0,
    date TEXT NOT NULL,
    user_name TEXT,
    notes TEXT,
    sucursal TEXT DEFAULT 'Norte',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON public.stock_movements (date);

-- 7. TABLA DE SESIONES Y CORTES DE CAJA
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    opened_by TEXT NOT NULL,
    initial_cash NUMERIC(12, 2) DEFAULT 0,
    final_cash NUMERIC(12, 2),
    status TEXT DEFAULT 'Abierta',
    sales_total NUMERIC(12, 2) DEFAULT 0,
    expenses_total NUMERIC(12, 2) DEFAULT 0,
    expected_final_cash NUMERIC(12, 2) DEFAULT 0,
    sucursal TEXT DEFAULT 'Norte',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABLA DE GASTOS Y SALIDAS DE CAJA
CREATE TABLE IF NOT EXISTS public.cash_expenses (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT DEFAULT 'General',
    date TEXT NOT NULL,
    user_name TEXT,
    sucursal TEXT DEFAULT 'Norte',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TABLA DE ÓRDENES DE COMPRA
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id TEXT PRIMARY KEY,
    supplier_id TEXT,
    supplier_name TEXT,
    total NUMERIC(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'Pendiente',
    date TEXT NOT NULL,
    received_date TEXT,
    payment_status TEXT DEFAULT 'Pendiente',
    sucursal TEXT DEFAULT 'Norte',
    items JSONB DEFAULT '[]'::jsonb,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TABLA DE USUARIOS DEL SISTEMA
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Cajero',
    status TEXT DEFAULT 'Activo',
    last_login TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TABLA DE PERMISOS Y ROLES
CREATE TABLE IF NOT EXISTS public.roles_permisos (
    id SERIAL PRIMARY KEY,
    rol TEXT UNIQUE NOT NULL,
    pos SMALLINT DEFAULT 1,
    inventory SMALLINT DEFAULT 0,
    customers SMALLINT DEFAULT 0,
    purchases SMALLINT DEFAULT 0,
    reports SMALLINT DEFAULT 0,
    security SMALLINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TABLA DE SUCURSALES
CREATE TABLE IF NOT EXISTS public.branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    manager TEXT,
    status TEXT DEFAULT 'Activo',
    is_central BOOLEAN DEFAULT false
);

-- 13. TABLA DE INVENTARIO MULTI-SUCURSAL
CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT,
    code TEXT,
    barcode TEXT,
    sucursal TEXT NOT NULL,
    stock NUMERIC(12, 3) DEFAULT 0,
    stock_min NUMERIC(12, 3) DEFAULT 0,
    stock_max NUMERIC(12, 3) DEFAULT 100,
    cost NUMERIC(12, 2) DEFAULT 0,
    price_min NUMERIC(12, 2) DEFAULT 0,
    raw_data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_lookup ON public.branch_inventory (sucursal, product_id);

-- 14. TABLAS DE FINANZAS EMPRESARIALES (CUENTAS, MOVIMIENTOS, PRESUPUESTOS, VEHÍCULOS)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id TEXT PRIMARY KEY,
    bank_name TEXT NOT NULL,
    account_number TEXT,
    type TEXT DEFAULT 'Cheques',
    balance NUMERIC(12, 2) DEFAULT 0,
    initial_balance NUMERIC(12, 2) DEFAULT 0,
    currency TEXT DEFAULT 'MXN',
    status TEXT DEFAULT 'Activo',
    branch TEXT,
    raw_data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bank_movements (
    id TEXT PRIMARY KEY,
    bank_account_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    category TEXT,
    reference TEXT,
    user_name TEXT,
    raw_data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.budgets (
    id TEXT PRIMARY KEY,
    branch TEXT,
    department TEXT,
    category TEXT,
    amount NUMERIC(12, 2) DEFAULT 0,
    month INT,
    year INT,
    notes TEXT,
    raw_data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.cost_centers (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    department TEXT,
    status TEXT DEFAULT 'Activo',
    raw_data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.vehicles (
    id TEXT PRIMARY KEY,
    plates TEXT NOT NULL,
    model TEXT,
    brand TEXT,
    driver TEXT,
    mileage NUMERIC(12, 1) DEFAULT 0,
    insurance_expiry TEXT,
    status TEXT DEFAULT 'Activo',
    raw_data JSONB DEFAULT '{}'::jsonb
);

-- 15. AUDITORÍA Y CONFIGURACIÓN DEL SISTEMA
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    user_name TEXT,
    role TEXT,
    action TEXT,
    details TEXT,
    timestamp TEXT,
    ip TEXT,
    branch TEXT
);

CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA DE ESTADO GLOBAL DE APLICACIÓN (RESPALDO COMPLETO JSON)
CREATE TABLE IF NOT EXISTS public.app_state (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. INSERCIÓN DE DATOS SEMILLA BASE (ADMIN Y ROLES)
INSERT INTO public.users (id, username, name, password, role, status)
VALUES ('USR_ADMIN', 'admin', 'Administrador General', 'admin', 'Administrador', 'Activo')
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.roles_permisos (rol, pos, inventory, customers, purchases, reports, security)
VALUES
    ('Administrador', 1, 1, 1, 1, 1, 1),
    ('Gerente', 1, 1, 1, 1, 1, 0),
    ('Cajero', 1, 0, 1, 0, 0, 0),
    ('Almacenista', 0, 1, 0, 1, 0, 0),
    ('Compras', 0, 0, 0, 1, 0, 0),
    ('Contabilidad', 0, 0, 0, 0, 1, 0)
ON CONFLICT (rol) DO NOTHING;

INSERT INTO public.branches (id, name, code, address, manager, status, is_central)
VALUES
    ('SUC_NORTE', 'Norte', 'SUC-01', 'Blvd. Industrial #450, Norte', 'Mariana Rivas', 'Activo', true),
    ('SUC_SUR', 'Sur', 'SUC-02', 'Calz. de las Luces #78, Sur', 'Roberto Gómez', 'Activo', false),
    ('SUC_CENTRO', 'Centro', 'SUC-03', 'Av. Juárez #100, Centro', 'Carlos Mendoza', 'Activo', false),
    ('SUC_BODEGA', 'Bodega', 'SUC-04', 'Parque Logístico Nave 12', 'Esteban Cruz', 'Activo', false)
ON CONFLICT (id) DO NOTHING;

-- 17. POLÍTICAS DE ROW LEVEL SECURITY (RLS) - PERMISOS PÚBLICOS/ANÓNIMOS CON CLAVE API
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow public all on %I" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Allow public all on %I" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
    END LOOP;
END $$;

-- 18. HABILITACIÓN DE SINCRONIZACIÓN EN TIEMPO REAL (REALTIME)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE 
    public.products,
    public.sales,
    public.customers,
    public.suppliers,
    public.stock_movements,
    public.cash_sessions,
    public.cash_expenses,
    public.purchase_orders,
    public.users,
    public.roles_permisos,
    public.branches,
    public.branch_inventory,
    public.system_settings,
    public.app_state;
