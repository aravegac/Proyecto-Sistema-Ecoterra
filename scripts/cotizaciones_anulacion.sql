-- Ejecutar en Supabase antes de desplegar el backend que usa estos campos.
BEGIN;
ALTER TABLE public.cotizacion
    ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz NULL,
    ADD COLUMN IF NOT EXISTS motivo_anulacion text NULL,
    ADD COLUMN IF NOT EXISTS id_usuario_anulacion integer NULL REFERENCES public.usuario(id_usuario);
COMMIT;
