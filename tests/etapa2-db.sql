-- Banco efemero do GitHub Actions: nunca conecta ao Supabase publicado.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.tournaments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'open',
 modality text NOT NULL DEFAULT 'areia_2x2',
 fee_cents integer NOT NULL DEFAULT 0,
 capacity integer NOT NULL DEFAULT 8,
 registration_deadline date,
 event_end_date date
);
CREATE TABLE public.tournament_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id),
 name text NOT NULL DEFAULT 'Livre',
 modality text NOT NULL DEFAULT 'areia_2x2',
 fee_cents integer NOT NULL DEFAULT 0,
 capacity integer NOT NULL DEFAULT 4,
 status text NOT NULL DEFAULT 'open'
);
CREATE TABLE public.registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id),
 category_id uuid REFERENCES public.tournament_categories(id),
 team_name text NOT NULL CHECK (length(btrim(team_name)) BETWEEN 2 AND 100),
 captain_name text NOT NULL,
 captain_email text NOT NULL,
 captain_phone text NOT NULL,
 athletes jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 payment_status text NOT NULL DEFAULT 'not_required'
);
COMMIT;
\ir ../supabase/migrations/20261106203000_drawn_team_registration_foundation.sql
\ir ../supabase/migrations/20261106204500_register_drawn_athlete.sql
\ir ../supabase/migrations/20261106213000_guard_formed_team_registration.sql
BEGIN;
DO $test$
DECLARE
 t uuid; d uuid; f uuid; q uuid; x uuid; n integer;
BEGIN
 INSERT INTO public.tournaments DEFAULT VALUES RETURNING id INTO t;
 INSERT INTO public.tournament_categories(tournament_id,name,registration_mode,capacity)
 VALUES(t,'Sorteada','drawn',2) RETURNING id INTO d;
 INSERT INTO public.tournament_categories(tournament_id,name,registration_mode,capacity)
 VALUES(t,'Formada','formed',2) RETURNING id INTO f;
 INSERT INTO public.tournament_categories(tournament_id,name,registration_mode,modality,capacity)
 VALUES(t,'Quarteto','drawn','areia_4x4',4) RETURNING id INTO q;

 x:=public.register_drawn_athlete(t,d,'Ana Lima','ana@exemplo.com','11999999999');
 IF x IS NULL THEN RAISE EXCEPTION 'Inscricao individual sem ID'; END IF;
 BEGIN
  PERFORM public.register_drawn_athlete(t,d,'Ana Lima','ana@exemplo.com','11999999999');
  RAISE EXCEPTION 'FALHA: email duplicado aceito';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: email duplicado aceito' THEN RAISE; END IF;
 END;
 PERFORM public.register_drawn_athlete(t,d,'Bia Lima','bia@exemplo.com','11999999998');
 BEGIN
  PERFORM public.register_drawn_athlete(t,d,'Cris Lima','cris@exemplo.com','11999999997');
  RAISE EXCEPTION 'FALHA: lotacao ignorada';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: lotacao ignorada' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.register_drawn_athlete(t,f,'Dani Lima','dani@exemplo.com','11999999996');
  RAISE EXCEPTION 'FALHA: individual aceito em formada';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: individual aceito em formada' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.register_team_by_category(t,d,'Dupla A','Eva Lima','eva@exemplo.com','11999999995',ARRAY['Eva Lima','Fabi Lima']);
  RAISE EXCEPTION 'FALHA: equipe aceita em sorteada';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: equipe aceita em sorteada' THEN RAISE; END IF;
 END;
 x:=public.register_team_by_category(t,f,'Dupla A','Eva Lima','eva@exemplo.com','11999999995',ARRAY['Eva Lima','Fabi Lima']);
 IF x IS NULL THEN RAISE EXCEPTION 'Equipe formada sem ID'; END IF;
 BEGIN
  PERFORM public.register_team_by_category(t,f,'Dupla B','Eva Lima','eva@exemplo.com','11999999995',ARRAY['Eva Lima','Gabi Lima']);
  RAISE EXCEPTION 'FALHA: capita duplicada aceita';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: capita duplicada aceita' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.register_team_by_category(t,f,'Dupla B','Hugo Lima','hugo@exemplo.com','11999999994',ARRAY['Hugo Lima','Hugo Lima']);
  RAISE EXCEPTION 'FALHA: nomes repetidos na equipe aceitos';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: nomes repetidos na equipe aceitos' THEN RAISE; END IF;
 END;
 PERFORM public.register_drawn_athlete(t,q,'Iara Lima','iara@exemplo.com','11999999993');
 SELECT count(*) INTO n FROM public.registrations WHERE tournament_id=t;
 IF n<>4 THEN RAISE EXCEPTION 'Contagem inesperada: %',n; END IF;
 -- Verificar pagamento, validacao, prazo, categoria fechada e lotacao de quarteto.
 IF (SELECT payment_status FROM public.registrations WHERE id=x)<>'not_required'
 THEN RAISE EXCEPTION 'Pagamento gratuito incorreto'; END IF;
 BEGIN
  PERFORM public.register_drawn_athlete(t,q,'','invalido','123');
  RAISE EXCEPTION 'FALHA: dados invalidos aceitos';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: dados invalidos aceitos' THEN RAISE; END IF;
 END;
 UPDATE public.tournament_categories SET capacity=3 WHERE id=q;
 BEGIN
  PERFORM public.register_drawn_athlete(t,q,'Joao Lima','joao@exemplo.com','11999999992');
  RAISE EXCEPTION 'FALHA: quarteto com capacidade invalida aceito';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: quarteto com capacidade invalida aceito' THEN RAISE; END IF;
 END;
 UPDATE public.tournament_categories SET capacity=4,fee_cents=2500 WHERE id=q;
 x:=public.register_drawn_athlete(t,q,'Joao Lima','joao@exemplo.com','11999999992');
 IF (SELECT payment_status FROM public.registrations WHERE id=x)<>'awaiting_provider'
 THEN RAISE EXCEPTION 'Pagamento pendente incorreto'; END IF;
 PERFORM public.register_drawn_athlete(t,q,'Katia Lima','katia@exemplo.com','11999999991');
 PERFORM public.register_drawn_athlete(t,q,'Lia Lima','lia@exemplo.com','11999999990');
 BEGIN
  PERFORM public.register_drawn_athlete(t,q,'Mara Lima','mara@exemplo.com','11999999989');
  RAISE EXCEPTION 'FALHA: quarteto lotado aceitou atleta';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: quarteto lotado aceitou atleta' THEN RAISE; END IF;
 END;
 UPDATE public.tournament_categories SET status='closed' WHERE id=f;
 BEGIN
  PERFORM public.register_team_by_category(t,f,'Dupla C','Nina Lima','nina@exemplo.com','11999999988',ARRAY['Nina Lima','Olga Lima']);
  RAISE EXCEPTION 'FALHA: categoria fechada aceitou inscricao';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: categoria fechada aceitou inscricao' THEN RAISE; END IF;
 END;
 UPDATE public.tournaments SET registration_deadline=current_date-1 WHERE id=t;
 BEGIN
  PERFORM public.register_drawn_athlete(t,d,'Paula Lima','paula@exemplo.com','11999999987');
  RAISE EXCEPTION 'FALHA: inscricao fora do prazo aceita';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FALHA: inscricao fora do prazo aceita' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'OK: individual, dupla, quarteto, duplicidade, lotacao, prazo, status, dados e pagamento';
END $test$;
ROLLBACK;
