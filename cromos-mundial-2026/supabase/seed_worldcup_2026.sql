begin;

drop view if exists public.v_repetidos;

alter table public.cromos
  alter column numero drop default;

alter table public.cromos
  alter column numero type text using numero::text;

with seeded_countries(nombre, iso) as (
  values
    ('FIFA World Cup', 'FWC'),
    ('Coca-Cola', 'COK'),
    ('Algeria', 'ALG'),
    ('Argentina', 'ARG'),
    ('Australia', 'AUS'),
    ('Austria', 'AUT'),
    ('Belgium', 'BEL'),
    ('Bosnia and Herzegovina', 'BIH'),
    ('Brazil', 'BRA'),
    ('Cabo Verde', 'CPV'),
    ('Canada', 'CAN'),
    ('Colombia', 'COL'),
    ('Congo DR', 'COD'),
    ('Cote d''Ivoire', 'CIV'),
    ('Croatia', 'CRO'),
    ('Curacao', 'CUW'),
    ('Czechia', 'CZE'),
    ('Ecuador', 'ECU'),
    ('Egypt', 'EGY'),
    ('England', 'ENG'),
    ('France', 'FRA'),
    ('Germany', 'GER'),
    ('Ghana', 'GHA'),
    ('Haiti', 'HTI'),
    ('Iraq', 'IRQ'),
    ('IR Iran', 'IRN'),
    ('Japan', 'JPN'),
    ('Jordan', 'JOR'),
    ('Korea Republic', 'KOR'),
    ('Mexico', 'MEX'),
    ('Morocco', 'MAR'),
    ('Netherlands', 'NED'),
    ('New Zealand', 'NZL'),
    ('Norway', 'NOR'),
    ('Panama', 'PAN'),
    ('Paraguay', 'PAR'),
    ('Portugal', 'POR'),
    ('Qatar', 'QAT'),
    ('Saudi Arabia', 'SAU'),
    ('Scotland', 'SCO'),
    ('Senegal', 'SEN'),
    ('South Africa', 'RSA'),
    ('Spain', 'ESP'),
    ('Sweden', 'SWE'),
    ('Switzerland', 'SUI'),
    ('Tunisia', 'TUN'),
    ('Turkiye', 'TUR'),
    ('Uruguay', 'URU'),
    ('USA', 'USA'),
    ('Uzbekistan', 'UZB')
)
insert into public.paises (nombre, iso)
select nombre, iso
from seeded_countries
on conflict (iso) do update
set nombre = excluded.nombre;

with promo_stickers(numero, nombre, pais_iso, posicion) as (
  values
    ('0', 'Panini Logo', 'FWC', 'especial'),
    ('FWC1', 'FWC 1', 'FWC', 'especial'),
    ('FWC2', 'FWC 2', 'FWC', 'especial'),
    ('FWC3', 'FWC 3', 'FWC', 'especial'),
    ('FWC4', 'FWC 4', 'FWC', 'especial'),
    ('FWC5', 'FWC 5', 'FWC', 'especial'),
    ('FWC6', 'FWC 6', 'FWC', 'especial'),
    ('FWC7', 'FWC 7', 'FWC', 'especial'),
    ('FWC8', 'FWC 8', 'FWC', 'especial'),
    ('FWC9', 'FWC 9', 'FWC', 'especial'),
    ('FWC10', 'FWC 10', 'FWC', 'especial'),
    ('FWC11', 'FWC 11', 'FWC', 'especial'),
    ('FWC12', 'FWC 12', 'FWC', 'especial'),
    ('FWC13', 'FWC 13', 'FWC', 'especial'),
    ('FWC14', 'FWC 14', 'FWC', 'especial'),
    ('FWC15', 'FWC 15', 'FWC', 'especial'),
    ('FWC16', 'FWC 16', 'FWC', 'especial'),
    ('FWC17', 'FWC 17', 'FWC', 'especial'),
    ('FWC18', 'FWC 18', 'FWC', 'especial'),
    ('FWC19', 'FWC 19', 'FWC', 'especial'),
    ('CC1', 'Coca-Cola 1', 'COK', 'especial'),
    ('CC2', 'Coca-Cola 2', 'COK', 'especial'),
    ('CC3', 'Coca-Cola 3', 'COK', 'especial'),
    ('CC4', 'Coca-Cola 4', 'COK', 'especial'),
    ('CC5', 'Coca-Cola 5', 'COK', 'especial'),
    ('CC6', 'Coca-Cola 6', 'COK', 'especial'),
    ('CC7', 'Coca-Cola 7', 'COK', 'especial'),
    ('CC8', 'Coca-Cola 8', 'COK', 'especial'),
    ('CC9', 'Coca-Cola 9', 'COK', 'especial'),
    ('CC10', 'Coca-Cola 10', 'COK', 'especial'),
    ('CC11', 'Coca-Cola 11', 'COK', 'especial'),
    ('CC12', 'Coca-Cola 12', 'COK', 'especial')
)
insert into public.cromos (numero, nombre, pais_id, posicion)
select
  s.numero,
  s.nombre,
  p.id,
  s.posicion::public.posicion_enum
from promo_stickers s
join public.paises p on p.iso = s.pais_iso
on conflict (numero) do update
set
  nombre = excluded.nombre,
  pais_id = excluded.pais_id,
  posicion = excluded.posicion;

with team_seed(nombre, iso) as (
  values
    ('Algeria', 'ALG'),
    ('Argentina', 'ARG'),
    ('Australia', 'AUS'),
    ('Austria', 'AUT'),
    ('Belgium', 'BEL'),
    ('Bosnia and Herzegovina', 'BIH'),
    ('Brazil', 'BRA'),
    ('Cabo Verde', 'CPV'),
    ('Canada', 'CAN'),
    ('Colombia', 'COL'),
    ('Congo DR', 'COD'),
    ('Cote d''Ivoire', 'CIV'),
    ('Croatia', 'CRO'),
    ('Curacao', 'CUW'),
    ('Czechia', 'CZE'),
    ('Ecuador', 'ECU'),
    ('Egypt', 'EGY'),
    ('England', 'ENG'),
    ('France', 'FRA'),
    ('Germany', 'GER'),
    ('Ghana', 'GHA'),
    ('Haiti', 'HTI'),
    ('Iraq', 'IRQ'),
    ('IR Iran', 'IRN'),
    ('Japan', 'JPN'),
    ('Jordan', 'JOR'),
    ('Korea Republic', 'KOR'),
    ('Mexico', 'MEX'),
    ('Morocco', 'MAR'),
    ('Netherlands', 'NED'),
    ('New Zealand', 'NZL'),
    ('Norway', 'NOR'),
    ('Panama', 'PAN'),
    ('Paraguay', 'PAR'),
    ('Portugal', 'POR'),
    ('Qatar', 'QAT'),
    ('Saudi Arabia', 'SAU'),
    ('Scotland', 'SCO'),
    ('Senegal', 'SEN'),
    ('South Africa', 'RSA'),
    ('Spain', 'ESP'),
    ('Sweden', 'SWE'),
    ('Switzerland', 'SUI'),
    ('Tunisia', 'TUN'),
    ('Turkiye', 'TUR'),
    ('Uruguay', 'URU'),
    ('USA', 'USA'),
    ('Uzbekistan', 'UZB')
),
generated_team_stickers as (
  select
    format('%s%s', t.iso, gs.slot)::text as numero,
    case
      when gs.slot = 1 then 'Escudo'
      when gs.slot = 13 then 'Foto de equipo'
      else format('Cromo %s', gs.slot)
    end as nombre,
    t.iso as pais_iso,
    case
      when gs.slot = 1 then 'escudo'
      when gs.slot between 2 and 3 then 'portero'
      when gs.slot between 4 and 10 then 'defensa'
      when gs.slot between 11 and 16 then 'centrocampista'
      when gs.slot between 17 and 20 then 'delantero'
      else 'especial'
    end as posicion
  from team_seed t
  cross join generate_series(1, 20) as gs(slot)
)
insert into public.cromos (numero, nombre, pais_id, posicion)
select
  s.numero,
  s.nombre,
  p.id,
  s.posicion::public.posicion_enum
from generated_team_stickers s
join public.paises p on p.iso = s.pais_iso
on conflict (numero) do update
set
  nombre = excluded.nombre,
  pais_id = excluded.pais_id,
  posicion = excluded.posicion;

create or replace view public.v_repetidos
with (security_invoker = true)
as
select
  cu.user_id,
  p.username,
  cu.cromo_id,
  c.numero,
  c.nombre as cromo_nombre,
  pa.nombre as pais,
  pa.iso as pais_iso,
  c.posicion,
  cu.cantidad
from public.coleccion_usuario cu
join public.cromos c on c.id = cu.cromo_id
join public.paises pa on pa.id = c.pais_id
join public.perfiles p on p.id = cu.user_id
where cu.cantidad > 1;

commit;
