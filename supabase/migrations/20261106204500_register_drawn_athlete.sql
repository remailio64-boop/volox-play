-- Individual sign-up for drawn pairs/quartets, without changing existing team RPC.
create or replace function public.register_drawn_athlete(
 p_tournament_id uuid,p_category_id uuid,p_athlete_name text,p_email text,p_phone text
) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tournaments%rowtype; c public.tournament_categories%rowtype; rid uuid;
begin
 select * into t from public.tournaments where id=p_tournament_id and status='open' for update;
 if not found then raise exception 'Campeonato indisponivel'; end if;
 if (t.registration_deadline is not null and (now() at time zone 'America/Sao_Paulo')::date > t.registration_deadline)
 or (t.event_end_date is not null and (now() at time zone 'America/Sao_Paulo')::date > t.event_end_date)
 then raise exception 'Inscricoes encerradas'; end if;
 select * into c from public.tournament_categories
 where id=p_category_id and tournament_id=t.id and status='open' and registration_mode='drawn';
 if not found or c.modality not in ('areia_2x2','areia_4x4','beach_tennis_duplas')
 then raise exception 'Categoria nao permite inscricao individual'; end if;
 if length(btrim(coalesce(p_athlete_name,''))) not between 2 and 100
 or length(btrim(coalesce(p_email,''))) not between 5 and 254 or p_email not like '%@%.%'
 or length(btrim(coalesce(p_phone,''))) not between 8 and 25
 then raise exception 'Dados do atleta invalidos'; end if;
 if exists(select 1 from public.registrations where category_id=c.id and status<>'rejected'
 and lower(btrim(captain_email))=lower(btrim(p_email)))
 then raise exception 'Este e-mail ja esta inscrito nesta categoria'; end if;
 if (select count(*) from public.registrations where category_id=c.id and status<>'rejected')>=c.capacity
 then raise exception 'Vagas esgotadas'; end if;
 insert into public.registrations(tournament_id,category_id,team_name,captain_name,captain_email,captain_phone,athletes,payment_status)
 values(t.id,c.id,btrim(p_athlete_name),btrim(p_athlete_name),btrim(p_email),btrim(p_phone),
 jsonb_build_array(btrim(p_athlete_name)),case when c.fee_cents=0 then 'not_required' else 'awaiting_provider' end)
 returning id into rid;
 return rid;
end $$;
revoke all on function public.register_drawn_athlete(uuid,uuid,text,text,text) from public;
grant execute on function public.register_drawn_athlete(uuid,uuid,text,text,text) to anon,authenticated;
