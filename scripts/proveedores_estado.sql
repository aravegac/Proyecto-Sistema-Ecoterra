-- Ejecutar en Supabase antes de desplegar el backend que usa este campo.
-- Los proveedores existentes quedan activos.
BEGIN;
ALTER TABLE public.proveedor
    ADD COLUMN IF NOT EXISTS estado_proveedor boolean NOT NULL DEFAULT TRUE;
COMMIT;
