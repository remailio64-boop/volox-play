-- Prevent formed-team RPC from bypassing individual signup and duplicate category email.
CREATE OR REPLACE FUNCTION public.register_team_by_category(p_tournament_id uuid, p_category_id uuid, p_team_name text, p_captain_name text, p_captain_email text, p_captain_phone text, p_athletes text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 t public.tournaments%ROWTYPE;
 c public.tournament_categories%ROWTYPE;
 n integer;
 rid uuid;
 v_fee integer;
 v_capacity integer;
BEGIN
 -- Lock tournament: serialize registrations across categories and legacy calls.
 SELECT * INTO t FROM public.tournaments
 WHERE id=p_tournament_id AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campeonato indisponivel'; END IF;
 if (t.registration_deadline is not null and (now() at time zone 'America/Sao_Paulo')::date > t.registration_deadline) or (t.event_end_date is not null and (now() at time zone 'America/Sao_Paulo')::date > t.event_end_date) then raise exception 'Inscrições encerradas para este campeonato'; end if;

 IF EXISTS(SELECT 1 FROM public.tournament_categories
           WHERE tournament_id=t.id) THEN
   IF p_category_id IS NULL THEN RAISE EXCEPTION 'Escolha uma categoria'; END IF;
   SELECT * INTO c FROM public.tournament_categories
    WHERE id=p_category_id AND tournament_id=t.id AND status='open';
   IF NOT FOUND THEN RAISE EXCEPTION 'Categoria indisponivel'; END IF;
   IF c.registration_mode='drawn' THEN RAISE EXCEPTION 'Esta categoria exige inscricao individual'; END IF;
   n:=CASE c.modality WHEN 'quadra_6x6' THEN 6 when 'beach_tennis_duplas' then 2 when 'beach_tennis_simples' then 1
                     WHEN 'areia_2x2' THEN 2 ELSE 4 END;
   v_fee:=c.fee_cents;
   v_capacity:=c.capacity;
   IF (SELECT count(*) FROM public.registrations
       WHERE category_id=c.id AND status<>'rejected') >= v_capacity
   THEN RAISE EXCEPTION 'Vagas esgotadas nesta categoria'; END IF;
 ELSE
   IF p_category_id IS NOT NULL THEN RAISE EXCEPTION 'Categoria invalida'; END IF;
   n:=CASE t.modality WHEN 'quadra_6x6' THEN 6 when 'beach_tennis_duplas' then 2 when 'beach_tennis_simples' then 1
                     WHEN 'areia_2x2' THEN 2 ELSE 4 END;
   v_fee:=t.fee_cents;
   v_capacity:=t.capacity;
   IF (SELECT count(*) FROM public.registrations
       WHERE tournament_id=t.id AND status<>'rejected') >= v_capacity
   THEN RAISE EXCEPTION 'Vagas esgotadas'; END IF;
 END IF;

 IF length(btrim(coalesce(p_team_name,''))) NOT BETWEEN 2 AND 100
 OR length(btrim(coalesce(p_captain_name,''))) NOT BETWEEN 2 AND 100
 OR length(btrim(coalesce(p_captain_email,''))) NOT BETWEEN 5 AND 254
 OR p_captain_email NOT LIKE '%@%.%'
 OR length(btrim(coalesce(p_captain_phone,''))) NOT BETWEEN 8 AND 25
 THEN RAISE EXCEPTION 'Dados do responsavel invalidos'; END IF;

 IF coalesce(array_length(p_athletes,1),0)<>n
 OR EXISTS(SELECT 1 FROM unnest(p_athletes) a
           WHERE length(btrim(coalesce(a,''))) NOT BETWEEN 2 AND 100)
 THEN RAISE EXCEPTION 'Quantidade ou nomes de atletas invalidos'; END IF;

 IF EXISTS (
   SELECT 1 FROM unnest(p_athletes) AS incoming(name)
   JOIN public.registrations AS existing
     ON existing.tournament_id=t.id
    AND existing.category_id IS NOT DISTINCT FROM p_category_id
    AND existing.status<>'rejected'
   CROSS JOIN LATERAL jsonb_array_elements_text(existing.athletes) AS registered(name)
   WHERE lower(btrim(incoming.name))=lower(btrim(registered.name))
 ) THEN RAISE EXCEPTION 'Atleta ja inscrito nesta categoria'; END IF;
 IF EXISTS (
   SELECT 1 FROM unnest(p_athletes) AS incoming(name)
   GROUP BY lower(btrim(incoming.name))
   HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'Atleta repetido na mesma equipe'; END IF;
 IF EXISTS(SELECT 1 FROM public.registrations r WHERE r.tournament_id=t.id AND r.category_id IS NOT DISTINCT FROM p_category_id AND r.status<>'rejected' AND lower(btrim(r.captain_email))=lower(btrim(p_captain_email))) THEN RAISE EXCEPTION 'Este e-mail ja esta inscrito nesta categoria'; END IF;
 INSERT INTO public.registrations(
  tournament_id,category_id,team_name,captain_name,captain_email,
  captain_phone,athletes,payment_status
 ) VALUES(
  t.id,p_category_id,btrim(p_team_name),btrim(p_captain_name),
  btrim(p_captain_email),btrim(p_captain_phone),to_jsonb(p_athletes),
  CASE WHEN v_fee=0 THEN 'not_required' ELSE 'awaiting_provider' END
 ) RETURNING id INTO rid;
 RETURN rid;
END;
$function$
;
