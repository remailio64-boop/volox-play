alter table public.tournament_categories add column registrations_closed boolean not null default false;
update public.tournament_categories c set registrations_closed=true where exists(select 1 from public.draw_groups g where g.category_id=c.id);

-- Distinguish paid individual entries from the non-billable teams formed from them.
alter table public.registrations add column entry_kind text not null default 'formed'
 check(entry_kind in ('formed','individual','drawn_team'));
update public.registrations r set entry_kind='individual' from public.tournament_categories c
 where c.id=r.category_id and c.registration_mode='drawn';
alter table public.drawn_teams add column team_registration_id uuid not null unique
 references public.registrations(id) on delete cascade;

create function volox_private.guard_drawn_entry() returns trigger
language plpgsql security definer set search_path='' as $$
declare mode text; owner_id uuid; closed boolean; locked boolean; participant boolean;
begin
 if tg_op='INSERT' and new.category_id is not null then perform pg_advisory_xact_lock(hashtext(new.category_id::text)); end if;
 select c.registration_mode,t.organizer_id,c.registrations_closed into mode,owner_id,closed
 from public.tournament_categories c join public.tournaments t on t.id=c.tournament_id where c.id=new.category_id;
 if tg_op='UPDATE' then
  if new.entry_kind is distinct from old.entry_kind then raise exception 'O tipo original da inscrição não pode ser alterado'; end if;
  if new.status is distinct from old.status then
   perform pg_advisory_xact_lock(hashtext(new.category_id::text));
   locked:=exists(select 1 from public.drawn_teams where category_id=new.category_id)
     or exists(select 1 from public.draw_groups where category_id=new.category_id);
   participant:=exists(select 1 from public.drawn_teams where category_id=new.category_id and old.id=any(member_registration_ids))
     or exists(select 1 from public.draw_group_teams where category_id=new.category_id and registration_id=old.id)
     or old.entry_kind='drawn_team';
   if locked and (participant or new.status='approved') then
    raise exception 'O sorteio já foi realizado. As inscrições participantes não podem ser alteradas ou ampliadas';
   end if;
  end if;
 elsif mode='drawn' then
  if closed and new.entry_kind<>'drawn_team' then raise exception 'Inscrições encerradas nesta categoria'; end if;
  perform pg_advisory_xact_lock(hashtext(new.category_id::text));
  if new.entry_kind='drawn_team' then
   if auth.uid() is distinct from owner_id then raise exception 'Somente o organizador pode formar equipes'; end if;
  else
   if exists(select 1 from public.drawn_teams where category_id=new.category_id) then
    raise exception 'Inscrições encerradas: as equipes já foram sorteadas';
   end if;
   new.entry_kind:='individual';
  end if;
 elsif closed then raise exception 'Inscrições encerradas nesta categoria';
 elsif new.entry_kind<>'formed' then raise exception 'Tipo de inscrição inválido para a categoria';
 end if;
 return new;
end; $$;
revoke all on function volox_private.guard_drawn_entry() from public,anon,authenticated;
create trigger guard_drawn_entry before insert or update on public.registrations
 for each row execute function volox_private.guard_drawn_entry();

create function volox_private.draw_category_teams(p_category_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.tournament_categories%rowtype; tid uuid; owner_id uuid; size integer;
 approved_ids uuid[]; members uuid[]; names jsonb; head public.registrations%rowtype;
 team_rid uuid; total integer; pos integer:=1; team_no integer:=0;
begin
 select t.id,t.organizer_id into tid,owner_id from public.tournament_categories tc
 join public.tournaments t on t.id=tc.tournament_id where tc.id=p_category_id;
 if auth.uid() is null or owner_id is distinct from auth.uid() then raise exception 'Categoria não encontrada ou acesso negado'; end if;
 perform 1 from public.tournaments where id=tid for update;
 perform pg_advisory_xact_lock(hashtext(p_category_id::text));
 select * into c from public.tournament_categories where id=p_category_id for update;
 if c.registration_mode<>'drawn' or c.status<>'open' then raise exception 'Selecione uma categoria aberta com inscrições individuais'; end if;
 size:=case c.modality when 'areia_4x4' then 4 when 'areia_2x2' then 2 when 'beach_tennis_duplas' then 2 else 0 end;
 if size=0 then raise exception 'Modalidade não permite equipes sorteadas'; end if;
 if exists(select 1 from public.drawn_teams where category_id=c.id)
 or exists(select 1 from public.draw_groups where category_id=c.id) then raise exception 'Esta categoria já possui sorteio registrado'; end if;
 select array_agg(id order by random()) into approved_ids from public.registrations
 where category_id=c.id and entry_kind='individual' and status='approved' and payment_status in ('paid','not_required');
 total:=coalesce(cardinality(approved_ids),0);
 if total<size*4 then raise exception 'São necessários pelo menos % atletas aprovados para formar quatro equipes',size*4; end if;
 if total%size<>0 then raise exception 'Os % atletas aprovados não formam equipes completas de %. Ajuste as aprovações antes do sorteio',total,size; end if;
 while pos<=total loop
  team_no:=team_no+1;members:=approved_ids[pos:pos+size-1];
  select jsonb_agg(r.athletes->0 order by m.ord) into names
  from unnest(members) with ordinality m(id,ord) join public.registrations r on r.id=m.id;
  select * into head from public.registrations where id=members[1];
  insert into public.registrations(tournament_id,category_id,team_name,captain_name,captain_email,captain_phone,
    athletes,status,payment_status,entry_kind)
  values(c.tournament_id,c.id,'Equipe sorteada '||team_no,head.captain_name,head.captain_email,head.captain_phone,
    names,'approved','not_required','drawn_team') returning id into team_rid;
  insert into public.registration_athletes(registration_id,athlete_id,slot,status,confirmed_at)
  select team_rid,ra.athlete_id,m.ord,'confirmed',ra.confirmed_at
  from unnest(members) with ordinality m(id,ord)
  join public.registration_athletes ra on ra.registration_id=m.id and ra.status='confirmed';
  insert into public.drawn_teams(category_id,team_number,member_registration_ids,team_registration_id)
   values(c.id,team_no,members,team_rid);
  pos:=pos+size;
 end loop;
 update public.tournament_categories set registrations_closed=true where id=c.id;
 return team_no;
end; $$;
revoke all on function volox_private.draw_category_teams(uuid) from public,anon,authenticated;
grant execute on function volox_private.draw_category_teams(uuid) to authenticated;
create or replace function public.draw_category_teams(p_category_id uuid) returns integer
language sql security invoker set search_path='' as $$ select volox_private.draw_category_teams(p_category_id); $$;
revoke all on function public.draw_category_teams(uuid) from public,anon,authenticated;
grant execute on function public.draw_category_teams(uuid) to authenticated;

create function volox_private.list_drawn_teams(p_category_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('team_number',dt.team_number,'team_name',team.team_name,
 'is_own_team',exists(select 1 from public.registration_athletes mine where mine.registration_id=team.id and mine.athlete_id=auth.uid()),
 'members',(select jsonb_agg(jsonb_build_object('name',case
  when t.organizer_id=auth.uid() or p.is_public or p.id=auth.uid() or exists(select 1 from public.registration_athletes mine where mine.registration_id=team.id and mine.athlete_id=auth.uid()) then coalesce(p.display_name,r.athletes->>0)
  else 'Atleta com perfil reservado' end,
  'public_code',case when p.is_public then p.public_code else null end)
  order by m.ord)
 from unnest(dt.member_registration_ids) with ordinality m(id,ord)
 join public.registrations r on r.id=m.id
 left join public.registration_athletes ra on ra.registration_id=r.id
 left join public.athlete_profiles p on p.id=ra.athlete_id)) order by dt.team_number),'[]'::jsonb)
 from public.drawn_teams dt join public.tournament_categories c on c.id=dt.category_id
 join public.tournaments t on t.id=c.tournament_id
 join public.registrations team on team.id=dt.team_registration_id
 where c.id=p_category_id and (t.organizer_id=auth.uid() or (t.status='open' and c.status='open'));
$$;
revoke all on function volox_private.list_drawn_teams(uuid) from public,anon,authenticated;
grant execute on function volox_private.list_drawn_teams(uuid) to anon,authenticated;
create function public.get_drawn_teams(p_category_id uuid) returns jsonb language sql security invoker set search_path=''
 as $$ select volox_private.list_drawn_teams(p_category_id); $$;
revoke all on function public.get_drawn_teams(uuid) from public,anon,authenticated;
grant execute on function public.get_drawn_teams(uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.sortear_chaves(p_category_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_organizer uuid;
  v_mode text;
  v_status text;
  v_draw_status text;
  v_total integer;
  v_groups integer;
  v_base integer;
  v_extra integer;
  v_group_index integer;
  v_group_size integer;
  v_group_id uuid;
  v_group_name text;
  v_team_ids uuid[];
  v_group_teams uuid[];
  v_position integer := 1;
  v_i integer;
  v_j integer;
BEGIN
  -- Exige usuário autenticado.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Login obrigatorio';
  END IF;

  perform pg_advisory_xact_lock(hashtext(p_category_id::text));
  -- Confere o organizador e a categoria.
  SELECT t.organizer_id, c.status, c.registration_mode
  INTO v_organizer, v_status, v_mode
  FROM public.tournament_categories c
  JOIN public.tournaments t
    ON t.id = c.tournament_id
  WHERE c.id = p_category_id
  FOR UPDATE OF c;

  IF NOT FOUND OR v_organizer IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Categoria nao encontrada ou acesso negado';
  END IF;

  -- Não permite sortear uma categoria encerrada.
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'A categoria precisa estar aberta';
  END IF;

  -- Configuração inicial para duas chaves equilibradas,
  -- com 2 classificadas.
  INSERT INTO public.draw_settings (
    category_id,
    teams_per_group,
    qualifiers_per_group
  )
  VALUES (p_category_id, 4, 2)
  ON CONFLICT (category_id) DO NOTHING;

  SELECT draw_status
  INTO v_draw_status
  FROM public.draw_settings
  WHERE category_id = p_category_id
  FOR UPDATE;

  -- Impede repetir um sorteio já confirmado.
  IF v_draw_status <> 'draft' THEN
    RAISE EXCEPTION 'Esta categoria ja foi sorteada';
  END IF;

  -- Busca somente inscrições aprovadas.
  SELECT array_agg(r.id ORDER BY random())
  INTO v_team_ids
  FROM public.registrations r
  WHERE r.category_id = p_category_id
    AND r.status = 'approved' AND r.payment_status in ('paid','not_required')
    AND ((v_mode='formed' and r.entry_kind='formed') or (v_mode='drawn' and r.entry_kind='drawn_team'));

  v_total := COALESCE(cardinality(v_team_ids), 0);

  IF v_total < 4 THEN
    RAISE EXCEPTION 'São necessárias pelo menos 4 equipes aprovadas; nas categorias individuais, forme as equipes primeiro';
  END IF;

  -- Distribui em duas chaves equilibradas para as semifinais.
  -- Cada chave recebe pelo menos duas equipes.
  v_groups := 2; -- Duas chaves equilibradas; duas equipes avançam de cada chave.
  v_base := v_total / v_groups;
  v_extra := v_total % v_groups;

  IF v_base < 2 THEN
    RAISE EXCEPTION 'Nao foi possivel formar chaves validas';
  END IF;

  -- Segurança: não sobrescreve chaves existentes.
  IF EXISTS (
    SELECT 1
    FROM public.draw_groups
    WHERE category_id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Ja existem chaves nesta categoria';
  END IF;

  FOR v_group_index IN 1..v_groups LOOP
    v_group_size := v_base
      + CASE
          WHEN v_group_index <= v_extra THEN 1
          ELSE 0
        END;

    v_group_name := 'Chave ' || v_group_index::text;

    INSERT INTO public.draw_groups (
      category_id,
      group_name
    )
    VALUES (
      p_category_id,
      v_group_name
    )
    RETURNING id INTO v_group_id;

    v_group_teams := ARRAY[]::uuid[];

    FOR v_i IN 1..v_group_size LOOP
      INSERT INTO public.draw_group_teams (
        category_id,
        group_id,
        registration_id
      )
      VALUES (
        p_category_id,
        v_group_id,
        v_team_ids[v_position]
      );

      v_group_teams :=
        array_append(v_group_teams, v_team_ids[v_position]);

      v_position := v_position + 1;
    END LOOP;

    -- Cada equipe enfrenta todas as outras da chave.
    FOR v_i IN 1..(v_group_size - 1) LOOP
      FOR v_j IN (v_i + 1)..v_group_size LOOP
        INSERT INTO public.draw_matches (
          category_id,
          group_id,
          phase,
          round_number,
          team_a_id,
          team_b_id,
          status
        )
        VALUES (
          p_category_id,
          v_group_id,
          'groups',
          1,
          v_group_teams[v_i],
          v_group_teams[v_j],
          'scheduled'
        );
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.draw_settings
  SET draw_status = 'drawn'
  WHERE category_id = p_category_id;

  update public.tournament_categories set registrations_closed=true where id=p_category_id;
  RETURN jsonb_build_object(
    'success', true,
    'category_id', p_category_id,
    'teams', v_total,
    'groups', v_groups,
    'message', 'Sorteio realizado com sucesso'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION volox_private.confirm_athlete_ranking(p_category_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare required_players integer; finalists uuid[]; expected_finalists uuid[]; third_players uuid[]; expected_third uuid[];
begin
 select case c.modality when 'quadra_6x6' then 6 when 'areia_4x4' then 4
 when 'beach_tennis_simples' then 1 else 2 end into required_players
 from public.tournament_categories c join public.tournaments t on t.id=c.tournament_id
 where c.id=p_category_id and t.organizer_id=auth.uid() for update of c;
 if not found then raise exception 'Categoria não encontrada ou acesso negado'; end if;
 perform pg_advisory_xact_lock(hashtext(p_category_id::text));
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
end; $function$;

CREATE OR REPLACE FUNCTION volox_private.athlete_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('profile',(select to_jsonb(p) from public.athlete_profiles p where p.id=auth.uid()),
 'participations',coalesce((select jsonb_agg(jsonb_build_object('registration_id',r.id,'tournament_name',t.name,
 'slug',case when t.status='open' then t.slug else null end,'category_name',coalesce(c.name,t.category),
 'modality',coalesce(c.modality,t.modality),'team_name',coalesce(team.team_name,r.team_name),'membership_status',ra.status,
 'registration_status',r.status,'points',e.points,'placement',e.placement) order by r.created_at desc)
 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id
 join public.tournaments t on t.id=r.tournament_id left join public.tournament_categories c on c.id=r.category_id
 left join public.drawn_teams dt on r.id=any(dt.member_registration_ids)
 left join public.registrations team on team.id=dt.team_registration_id
 left join volox_private.athlete_result_entries e on e.registration_id=coalesce(dt.team_registration_id,r.id) and e.athlete_id=ra.athlete_id
 where ra.athlete_id=auth.uid() and r.entry_kind<>'drawn_team'),'[]'::jsonb));
$function$;

