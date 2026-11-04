-- Ejecutar en Supabase antes de desplegar el backend que usa estos campos.
-- Se conserva la convención existente de nombres en minúsculas.
BEGIN;
ALTER TABLE public.cliente
    ADD COLUMN IF NOT EXISTS pais_cliente varchar(100) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS region_cliente varchar(100) NOT NULL DEFAULT '';
COMMIT;
