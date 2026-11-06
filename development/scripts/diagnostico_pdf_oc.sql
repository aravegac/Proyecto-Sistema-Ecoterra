-- Diagnóstico: vistas previas de PDF de órdenes de compra.
-- Pegar en Supabase > SQL Editor. Solo lee, no cambia nada.
-- El backend usa el bucket de SUPABASE_STORAGE_BUCKET; si no está definido, usa 'facturas-pdf'.

-- 1) ¿Existe el bucket y es privado? (privado está bien: el backend firma la URL)
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets;

-- 2) Cada OC con su ruta y si el archivo existe de verdad en Storage.
select
  oc.id_oc,
  oc.numero_oc,
  oc.ruta_documento_oc,
  case
    when coalesce(oc.ruta_documento_oc, '') = '' then 'SIN RUTA'
    when oc.ruta_documento_oc ~ '^https?://' then 'URL EXTERNA (no se firma)'
    when o.id is null then 'NO EXISTE EN STORAGE'
    else 'OK'
  end as estado,
  o.bucket_id,
  o.metadata ->> 'mimetype' as mimetype,
  (o.metadata ->> 'size')::bigint as bytes
from orden_compra oc
left join storage.objects o
  on o.name = oc.ruta_documento_oc
order by estado, oc.numero_oc;

-- 3) Resumen por estado.
select
  case
    when coalesce(oc.ruta_documento_oc, '') = '' then 'SIN RUTA'
    when oc.ruta_documento_oc ~ '^https?://' then 'URL EXTERNA'
    when o.id is null then 'NO EXISTE EN STORAGE'
    else 'OK'
  end as estado,
  count(*)
from orden_compra oc
left join storage.objects o on o.name = oc.ruta_documento_oc
group by 1;

-- 4) PDFs subidos a ordenes-compra/ que ninguna OC usa (huérfanos).
select o.bucket_id, o.name, o.created_at
from storage.objects o
where o.name like 'ordenes-compra/%'
  and not exists (select 1 from orden_compra oc where oc.ruta_documento_oc = o.name)
order by o.created_at desc;
