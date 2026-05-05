alter table public.cromos
  add column if not exists avatar_url text;

alter table public.cromos
  add column if not exists avatar_url_sportsdb text;

create or replace view public.v_repetidos
with (security_invoker = true)
as
select
  cu.user_id,
  p.username,
  cu.cromo_id,
  c.numero,
  c.nombre as cromo_nombre,
  c.avatar_url,
  c.avatar_url_sportsdb,
  pa.nombre as pais,
  pa.iso as pais_iso,
  c.posicion,
  cu.cantidad
from public.coleccion_usuario cu
join public.cromos c on c.id = cu.cromo_id
join public.paises pa on pa.id = c.pais_id
join public.perfiles p on p.id = cu.user_id
where cu.cantidad > 1;
