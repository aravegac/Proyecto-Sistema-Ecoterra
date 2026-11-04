-- Ejecutar en Supabase antes de desplegar el backend que usa estos campos.
BEGIN;
ALTER TABLE public.nota_credito
    ALTER COLUMN estado_nc SET DEFAULT 'PENDIENTE',
    ADD COLUMN IF NOT EXISTS id_usuario_anulacion_nc integer NULL REFERENCES public.usuario(id_usuario),
    ADD COLUMN IF NOT EXISTS fecha_anulacion_nc timestamptz NULL,
    ADD COLUMN IF NOT EXISTS motivo_anulacion_nc text NULL;
COMMIT;
