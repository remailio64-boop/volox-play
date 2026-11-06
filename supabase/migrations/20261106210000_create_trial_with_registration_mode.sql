-- Preserve trial entitlement; persist category registration mode.
CREATE OR REPLACE FUNCTION public.create_trial_tournament(p_name text, p_categories jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_id uuid; c jsonb; v_first jsonb; v_slug text; v_used int;
begin
 if v_user is null then raise exception 'Login obrigatorio'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,391));
 select count(*) into v_used from public.organizer_trial_publications where organizer_id=v_user;
 if v_used>=3 and not exists(select 1 from public.platform_free_organizers where organizer_id=v_user)
 then raise exception 'Limite gratuito atingido'; end if;
 if p_name is null or length(btrim(p_name)) not between 3 and 100 or jsonb_typeof(p_categories)<>'array' or jsonb_array_length(p_categories) not between 1 and 100 then raise exception 'Dados invalidos'; end if;
 for c in select value from jsonb_array_elements(p_categories) loop
  if jsonb_typeof(c)<>'object' or length(btrim(coalesce(c->>'name',''))) not between 1 and 60
   or coalesce(c->>'modality','') not in ('areia_2x2','areia_4x4','quadra_6x6','beach_tennis_duplas','beach_tennis_simples')
   or coalesce(c->>'registration_mode','formed') not in ('formed','drawn')
   or (coalesce(c->>'registration_mode','formed')='drawn' and c->>'modality' not in ('areia_2x2','areia_4x4','beach_tennis_duplas'))
   or (coalesce(c->>'registration_mode','formed')='drawn' and coalesce(c->>'capacity','') ~ '^[0-9]{1,3}
   or coalesce(c->>'fee_cents','') !~ '^[0-9]{1,9}$'
   or coalesce(c->>'capacity','') !~ '^[0-9]{1,3}$'
   or (c->>'capacity')::int not between 2 and 512
  then raise exception 'Categoria invalida'; end if;
 end loop;
 if exists(select 1 from (select lower(btrim(value->>'name')) as n from jsonb_array_elements(p_categories)) q group by n having count(*)>1) then raise exception 'Categorias repetidas'; end if;
 v_first:=p_categories->0;v_id:=gen_random_uuid();
 v_slug:=trim(both '-' from left(regexp_replace(lower(btrim(p_name)),'[^a-z0-9]+','-','g'),40))||'-'||replace(v_id::text,'-','');
 insert into public.tournaments(id,organizer_id,name,slug,modality,category,fee_cents,capacity,status,approval_mode)
 values(v_id,v_user,btrim(p_name),v_slug,v_first->>'modality',btrim(v_first->>'name'),(v_first->>'fee_cents')::int,(v_first->>'capacity')::int,'draft','manual');
 for c in select value from jsonb_array_elements(p_categories) loop
  insert into public.tournament_categories(tournament_id,name,modality,fee_cents,capacity,best_of,registration_mode)
  values(v_id,btrim(c->>'name'),c->>'modality',(c->>'fee_cents')::int,(c->>'capacity')::int,case when c->>'modality' in ('beach_tennis_duplas','beach_tennis_simples') then 1 else 3 end,coalesce(c->>'registration_mode','formed'));
 end loop;
 return v_id;
end $function$
;
 and (c->>'capacity')::int % (case when c->>'modality'='areia_4x4' then 4 else 2 end) <> 0)
   or coalesce(c->>'fee_cents','') !~ '^[0-9]{1,9}$'
   or coalesce(c->>'capacity','') !~ '^[0-9]{1,3}$'
   or (c->>'capacity')::int not between 2 and 512
  then raise exception 'Categoria invalida'; end if;
 end loop;
 if exists(select 1 from (select lower(btrim(value->>'name')) as n from jsonb_array_elements(p_categories)) q group by n having count(*)>1) then raise exception 'Categorias repetidas'; end if;
 v_first:=p_categories->0;v_id:=gen_random_uuid();
 v_slug:=trim(both '-' from left(regexp_replace(lower(btrim(p_name)),'[^a-z0-9]+','-','g'),40))||'-'||replace(v_id::text,'-','');
 insert into public.tournaments(id,organizer_id,name,slug,modality,category,fee_cents,capacity,status,approval_mode)
 values(v_id,v_user,btrim(p_name),v_slug,v_first->>'modality',btrim(v_first->>'name'),(v_first->>'fee_cents')::int,(v_first->>'capacity')::int,'draft','manual');
 for c in select value from jsonb_array_elements(p_categories) loop
  insert into public.tournament_categories(tournament_id,name,modality,fee_cents,capacity,best_of,registration_mode)
  values(v_id,btrim(c->>'name'),c->>'modality',(c->>'fee_cents')::int,(c->>'capacity')::int,case when c->>'modality' in ('beach_tennis_duplas','beach_tennis_simples') then 1 else 3 end,coalesce(c->>'registration_mode','formed'));
 end loop;
 return v_id;
end $function$
;
