-- Search exposes only names/cities already public or explicitly searchable.
-- Private histories, auth IDs and contacts are never returned.
alter table public.athlete_profiles add column allow_partner_search boolean not null default false;
grant insert(allow_partner_search),update(allow_partner_search) on public.athlete_profiles to authenticated;

create function volox_private.partner_search_text(p_text text) returns text
language sql immutable strict set search_path='' as $$
 select translate(lower(btrim(p_text)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
$$;
revoke all on function volox_private.partner_search_text(text) from public,anon,authenticated;

create function volox_private.search_athlete_partners(p_name text,p_city text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=volox_private.partner_search_text(coalesce(p_name,''));
 c text:=volox_private.partner_search_text(coalesce(p_city,''));
begin
 if auth.uid() is null then raise exception 'Entre na sua conta para buscar parceiros'; end if;
 if char_length(q)<3 or char_length(q)>60 or char_length(c)>100 then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('public_code',p.public_code,'display_name',p.display_name,'city',p.city)
  order by p.display_name,p.city,p.public_code) from (
   select a.public_code,a.display_name,a.city from public.athlete_profiles a
   where a.id<>auth.uid() and (a.is_public or a.allow_partner_search)
   and strpos(volox_private.partner_search_text(a.display_name),q)>0
   and (c='' or strpos(volox_private.partner_search_text(a.city),c)>0)
   order by a.display_name,a.city,a.public_code limit 12
  ) p),'[]'::jsonb);
end;
$$;
revoke all on function volox_private.search_athlete_partners(text,text) from public,anon,authenticated;
grant execute on function volox_private.search_athlete_partners(text,text) to authenticated;
create function public.search_athlete_partners(p_name text,p_city text default '') returns jsonb
language sql security invoker set search_path='' as $$
 select volox_private.search_athlete_partners(p_name,p_city);
$$;
revoke all on function public.search_athlete_partners(text,text) from public,anon,authenticated;
grant execute on function public.search_athlete_partners(text,text) to authenticated;
