create schema volox_private;
revoke all on schema volox_private from public;
grant usage on schema volox_private to anon,authenticated;

create table public.athlete_profiles(
 id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 public_code text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,12),
 display_name text not null check(char_length(btrim(display_name)) between 2 and 60),
 city text not null default '' check(char_length(city)<=100),
 is_public boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.athlete_profiles enable row level security;
revoke all on public.athlete_profiles from public,anon,authenticated;
grant select on public.athlete_profiles to anon,authenticated;
grant insert(display_name,city,is_public),update(display_name,city,is_public) on public.athlete_profiles to authenticated;
create policy athlete_profile_read on public.athlete_profiles for select to anon,authenticated
 using (is_public or id=(select auth.uid()));
create policy athlete_profile_create on public.athlete_profiles for insert to authenticated
 with check(id=(select auth.uid()));
create policy athlete_profile_edit on public.athlete_profiles for update to authenticated
 using(id=(select auth.uid())) with check(id=(select auth.uid()));

alter table public.registrations add column submitted_by uuid default auth.uid();
create index registrations_submitted_by_idx on public.registrations(submitted_by);
create policy athlete_read_submitted_registration on public.registrations for select to authenticated
 using(submitted_by=(select auth.uid()));

create table public.registration_athletes(
 registration_id uuid not null references public.registrations(id) on delete cascade,
 athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
 slot smallint not null check(slot between 1 and 6),
 status text not null check(status in ('pending','confirmed','declined')) default 'pending',
 confirmed_at timestamptz,
 primary key(registration_id,athlete_id),unique(registration_id,slot)
);
create index registration_athletes_athlete_idx on public.registration_athletes(athlete_id);
alter table public.registration_athletes enable row level security;
revoke all on public.registration_athletes from public,anon,authenticated;
grant select on public.registration_athletes to authenticated;
create policy athlete_roster_read on public.registration_athletes for select to authenticated
 using(athlete_id=(select auth.uid()) or exists(
  select 1 from public.registrations r join public.tournaments t on t.id=r.tournament_id
  where r.id=registration_id and (r.submitted_by=(select auth.uid()) or t.organizer_id=(select auth.uid()))));

create table public.athlete_ranking_publications(
 category_id uuid primary key references public.tournament_categories(id) on delete cascade,
 confirmed_by uuid not null,
 confirmed_at timestamptz not null default now(),
 invalidated_at timestamptz
);
alter table public.athlete_ranking_publications enable row level security;
revoke all on public.athlete_ranking_publications from public,anon,authenticated;
grant select on public.athlete_ranking_publications to authenticated;
create policy ranking_publication_owner_read on public.athlete_ranking_publications for select to authenticated
 using(exists(select 1 from public.tournament_categories c join public.tournaments t on t.id=c.tournament_id
 where c.id=category_id and t.organizer_id=(select auth.uid())));

create function volox_private.lookup_athlete(p_code text) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('public_code',public_code,'display_name',display_name)
 from public.athlete_profiles where auth.uid() is not null and public_code=lower(btrim(p_code));
$$;

create function volox_private.register_athlete_team(p_tournament_id uuid,p_category_id uuid,
 p_team_name text,p_captain_email text,p_captain_phone text,p_athlete_codes text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; names text[]; captain text; rid uuid; n integer; mode text;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta de atleta para se inscrever'; end if;
 select display_name into captain from public.athlete_profiles where id=auth.uid();
 if captain is null then raise exception 'Complete seu perfil de atleta antes da inscrição'; end if;
 if coalesce(array_length(p_athlete_codes,1),0) not between 1 and 6 then raise exception 'Informe os códigos dos atletas'; end if;
 select array_agg(p.id order by x.ord),array_agg(p.display_name order by x.ord),count(distinct p.id)
 into ids,names,n from unnest(p_athlete_codes) with ordinality x(code,ord)
 join public.athlete_profiles p on p.public_code=lower(btrim(x.code));
 if n<>array_length(p_athlete_codes,1) then raise exception 'Código inexistente ou atleta repetido na equipe'; end if;
 if not(auth.uid()=any(ids)) then raise exception 'Você deve fazer parte da equipe que está inscrevendo'; end if;
 -- Serialize per tournament before checking for existing roster memberships.
 perform 1 from public.tournaments where id=p_tournament_id for update;
 if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id
  where r.tournament_id=p_tournament_id and r.category_id is not distinct from p_category_id
   and r.status<>'rejected' and ra.status<>'declined' and ra.athlete_id=any(ids)) then
  raise exception 'Um atleta já possui inscrição ou convite ativo nesta categoria';
 end if;
 select registration_mode into mode from public.tournament_categories where id=p_category_id and tournament_id=p_tournament_id;
 if mode='drawn' then
  if array_length(ids,1)<>1 then raise exception 'Esta categoria recebe inscrições individuais'; end if;
  rid:=public.register_drawn_athlete(p_tournament_id,p_category_id,names[1],p_captain_email,p_captain_phone);
 else
  rid:=public.register_team_by_category(p_tournament_id,p_category_id,p_team_name,captain,p_captain_email,p_captain_phone,names);
 end if;
 insert into public.registration_athletes(registration_id,athlete_id,slot,status,confirmed_at)
 select rid,x.id,x.ord,case when x.id=auth.uid() then 'confirmed' else 'pending' end,
 case when x.id=auth.uid() then now() else null end from unnest(ids) with ordinality x(id,ord);
 return rid;
end; $$;

create function volox_private.respond_athlete_invite(p_registration_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_accept is null then raise exception 'Entre na sua conta de atleta'; end if;
 update public.registration_athletes ra set status=case when p_accept then 'confirmed' else 'declined' end,
 confirmed_at=case when p_accept then now() else null end
 where ra.registration_id=p_registration_id and ra.athlete_id=auth.uid() and ra.status='pending'
 and exists(select 1 from public.registrations r where r.id=ra.registration_id and r.status<>'rejected');
 if not found then raise exception 'Convite indisponível ou já respondido'; end if;
end; $$;

create function volox_private.require_confirmed_athletes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and exists(select 1 from public.registration_athletes where registration_id=new.id)
 and (select count(*) from public.registration_athletes where registration_id=new.id and status='confirmed')<>jsonb_array_length(new.athletes) then
  raise exception 'Todos os atletas precisam confirmar o vínculo na própria conta antes da aprovação';
 end if;
 return new;
end; $$;
create trigger require_confirmed_athletes before update of status on public.registrations
 for each row execute function volox_private.require_confirmed_athletes();

create function volox_private.confirm_athlete_ranking(p_category_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare required_players integer; finalists uuid[]; expected_finalists uuid[]; third_players uuid[]; expected_third uuid[];
begin
 select case c.modality when 'quadra_6x6' then 6 when 'areia_4x4' then 4
 when 'beach_tennis_simples' then 1 else 2 end into required_players
 from public.tournament_categories c join public.tournaments t on t.id=c.tournament_id
 where c.id=p_category_id and t.organizer_id=auth.uid() for update of c;
 if not found then raise exception 'Categoria não encontrada ou acesso negado'; end if;
 perform pg_advisory_xact_lock(hashtext(p_category_id::text));
 if exists(select 1 from public.tournament_categories where id=p_category_id and registration_mode='drawn') then raise exception 'O ranking das equipes sorteadas depende da integração dos resultados das equipes formadas. O histórico individual já fica salvo'; end if;
 if (select count(*) from public.volox_knockout_matches where category_id=p_category_id
  and phase in ('semi1','semi2','final','third') and status='finished' and sets_a is not null and sets_b is not null and sets_a<>sets_b)<>4 then
  raise exception 'Finalize as semifinais, a final e a disputa de terceiro lugar';
 end if;
 select array_agg(w order by w),array_agg(l order by l) into expected_finalists,expected_third from (
  select case when sets_a>sets_b then team_a_id else team_b_id end w,
         case when sets_a>sets_b then team_b_id else team_a_id end l
  from public.volox_knockout_matches where category_id=p_category_id and phase in ('semi1','semi2')
 ) s;
 select array(select unnest(array[team_a_id,team_b_id]) order by 1) into finalists
 from public.volox_knockout_matches where category_id=p_category_id and phase='final';
 select array(select unnest(array[team_a_id,team_b_id]) order by 1) into third_players
 from public.volox_knockout_matches where category_id=p_category_id and phase='third';
 if finalists is distinct from expected_finalists or third_players is distinct from expected_third then
  raise exception 'Os confrontos finais precisam corresponder aos resultados das semifinais';
 end if;
 if not exists(select 1 from public.draw_matches where category_id=p_category_id)
 or exists(select 1 from public.draw_matches where category_id=p_category_id and status<>'finished') then
  raise exception 'Finalize todos os jogos das chaves'; end if;
 if exists(select 1 from public.draw_group_teams gt join public.draw_groups g on g.id=gt.group_id
  join public.registrations r on r.id=gt.registration_id where g.category_id=p_category_id and
  (r.status<>'approved' or (select count(*) from public.registration_athletes ra
   where ra.registration_id=r.id and ra.status='confirmed')<>required_players)) then
  raise exception 'Todos os atletas das equipes sorteadas precisam ter conta e confirmar seu vínculo. Inscrições antigas sem contas não pontuam automaticamente';
 end if;
 insert into public.athlete_ranking_publications(category_id,confirmed_by,confirmed_at,invalidated_at)
 values(p_category_id,auth.uid(),now(),null) on conflict(category_id) do update
 set confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,invalidated_at=null;
end; $$;

create function volox_private.invalidate_athlete_ranking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext((case when tg_op='DELETE' then old.category_id else new.category_id end)::text));
 update public.athlete_ranking_publications set invalidated_at=now()
 where category_id=case when tg_op='DELETE' then old.category_id else new.category_id end;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger athlete_ranking_score_changed after insert or update or delete on public.draw_matches
 for each row execute function volox_private.invalidate_athlete_ranking();
create trigger athlete_ranking_knockout_changed after insert or update or delete on public.volox_knockout_matches
 for each row execute function volox_private.invalidate_athlete_ranking();

-- Private projection: no contact information, and no direct API access.
create view volox_private.athlete_result_entries as
select ra.athlete_id,r.id registration_id,t.id tournament_id,t.name tournament_name,t.slug,
 c.id category_id,c.name category_name,c.modality,
 lower(regexp_replace(btrim(c.name),'\s+',' ','g')) category_key,
 r.team_name,arp.confirmed_at,
 (t.status='open' and c.status='open' and coalesce(rp.published,false)) is_visible,
 case when r.id=case when f.sets_a>f.sets_b then f.team_a_id else f.team_b_id end then 1
 when r.id=case when f.sets_a>f.sets_b then f.team_b_id else f.team_a_id end then 2
 when r.id=case when b.sets_a>b.sets_b then b.team_a_id else b.team_b_id end then 3
 when r.id=case when b.sets_a>b.sets_b then b.team_b_id else b.team_a_id end then 4 else 0 end placement,
 case when r.id=case when f.sets_a>f.sets_b then f.team_a_id else f.team_b_id end then 100
 when r.id=case when f.sets_a>f.sets_b then f.team_b_id else f.team_a_id end then 70
 when r.id=case when b.sets_a>b.sets_b then b.team_a_id else b.team_b_id end then 50
 when r.id=case when b.sets_a>b.sets_b then b.team_b_id else b.team_a_id end then 30 else 10 end points
from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id
join public.tournaments t on t.id=r.tournament_id
join public.tournament_categories c on c.id=r.category_id
join public.athlete_ranking_publications arp on arp.category_id=c.id and arp.invalidated_at is null
join public.volox_knockout_matches f on f.category_id=c.id and f.phase='final' and f.status='finished'
join public.volox_knockout_matches b on b.category_id=c.id and b.phase='third' and b.status='finished'
left join public.volox_result_publications rp on rp.category_id=c.id
where ra.status='confirmed' and r.status='approved'
and exists(select 1 from public.draw_group_teams gt join public.draw_groups g on g.id=gt.group_id
 where gt.registration_id=r.id and g.category_id=c.id);
revoke all on volox_private.athlete_result_entries from public,anon,authenticated;

create function volox_private.athlete_rankings() returns jsonb
language sql security definer set search_path='' as $$
 with totals as (
 select p.public_code,p.display_name,p.city,e.modality,e.category_key,min(e.category_name) category_name,
 sum(e.points)::integer points,count(*)::integer participations,count(*) filter(where e.placement=1)::integer titles
 from volox_private.athlete_result_entries e join public.athlete_profiles p on p.id=e.athlete_id
 where e.is_visible and p.is_public group by p.public_code,p.display_name,p.city,e.modality,e.category_key
 ), ranked as (
 select *,dense_rank() over(partition by modality,category_key order by points desc)::integer position from totals
 ) select coalesce(jsonb_agg(to_jsonb(ranked) order by modality,category_key,position,display_name),'[]'::jsonb) from ranked;
$$;

create function volox_private.athlete_dashboard() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('profile',(select to_jsonb(p) from public.athlete_profiles p where p.id=auth.uid()),
 'participations',coalesce((select jsonb_agg(jsonb_build_object('registration_id',r.id,'tournament_name',t.name,
 'slug',case when t.status='open' then t.slug else null end,'category_name',coalesce(c.name,t.category),
 'modality',coalesce(c.modality,t.modality),'team_name',r.team_name,'membership_status',ra.status,
 'registration_status',r.status,'points',e.points,'placement',e.placement) order by r.created_at desc)
 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id
 join public.tournaments t on t.id=r.tournament_id left join public.tournament_categories c on c.id=r.category_id
 left join volox_private.athlete_result_entries e on e.registration_id=r.id and e.athlete_id=ra.athlete_id
 where ra.athlete_id=auth.uid()),'[]'::jsonb));
$$;

create function volox_private.athlete_public_profile(p_code text) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('public_code',p.public_code,'display_name',p.display_name,'city',p.city,
 'history',coalesce((select jsonb_agg(jsonb_build_object('tournament_name',e.tournament_name,'slug',e.slug,
 'category_name',e.category_name,'modality',e.modality,'points',e.points,'placement',e.placement,
 'team_name',e.team_name,'confirmed_at',e.confirmed_at) order by e.confirmed_at desc)
 from volox_private.athlete_result_entries e where e.athlete_id=p.id and e.is_visible),'[]'::jsonb))
 from public.athlete_profiles p where p.public_code=lower(btrim(p_code)) and p.is_public;
$$;

-- Exposed wrappers are invokers; privileged implementations remain private.
create function public.lookup_athlete(p_code text) returns jsonb language sql security invoker set search_path=''
 as $$ select volox_private.lookup_athlete(p_code); $$;
create function public.register_athlete_team(p_tournament_id uuid,p_category_id uuid,p_team_name text,
 p_captain_email text,p_captain_phone text,p_athlete_codes text[]) returns uuid language sql security invoker set search_path=''
 as $$ select volox_private.register_athlete_team(p_tournament_id,p_category_id,p_team_name,p_captain_email,p_captain_phone,p_athlete_codes); $$;
create function public.respond_athlete_invite(p_registration_id uuid,p_accept boolean) returns void language sql security invoker set search_path=''
 as $$ select volox_private.respond_athlete_invite(p_registration_id,p_accept); $$;
create function public.confirm_athlete_ranking(p_category_id uuid) returns void language sql security invoker set search_path=''
 as $$ select volox_private.confirm_athlete_ranking(p_category_id); $$;
create function public.get_athlete_rankings() returns jsonb language sql security invoker set search_path=''
 as $$ select volox_private.athlete_rankings(); $$;
create function public.get_athlete_dashboard() returns jsonb language sql security invoker set search_path=''
 as $$ select volox_private.athlete_dashboard(); $$;
create function public.get_athlete_public_profile(p_code text) returns jsonb language sql security invoker set search_path=''
 as $$ select volox_private.athlete_public_profile(p_code); $$;
revoke all on all functions in schema volox_private from public,anon,authenticated;
grant execute on function volox_private.lookup_athlete(text),volox_private.register_athlete_team(uuid,uuid,text,text,text,text[]),
 volox_private.respond_athlete_invite(uuid,boolean),volox_private.confirm_athlete_ranking(uuid),volox_private.athlete_dashboard() to authenticated;
grant execute on function volox_private.athlete_rankings(),volox_private.athlete_public_profile(text) to anon,authenticated;
revoke all on function public.lookup_athlete(text),public.register_athlete_team(uuid,uuid,text,text,text,text[]),
 public.respond_athlete_invite(uuid,boolean),public.confirm_athlete_ranking(uuid),public.get_athlete_dashboard(),
 public.get_athlete_rankings(),public.get_athlete_public_profile(text) from public,anon,authenticated;
grant execute on function public.lookup_athlete(text),public.register_athlete_team(uuid,uuid,text,text,text,text[]),
 public.respond_athlete_invite(uuid,boolean),public.confirm_athlete_ranking(uuid),public.get_athlete_dashboard() to authenticated;
grant execute on function public.get_athlete_rankings(),public.get_athlete_public_profile(text) to anon,authenticated;
