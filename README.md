# Torneio Completo 2.0 — Etapa 1

MVP online em React + TypeScript + Supabase.

## Funcionalidades
- Cadastro/login de organizadores via Supabase Auth.
- Criação de campeonatos: quadra 6×6, areia 2×2, areia 4×4.
- Valor por equipe (0 = gratuito), vagas, categoria e aprovação manual.
- Link público de inscrição, com atletas titulares conforme a modalidade.
- Painel privado para listar inscrições, aprovar e rejeitar.
- Link individual de acompanhamento do status.
- PIX **não implementado**: inscrições pagas ficam em `awaiting_provider` e não podem ser aprovadas até confirmação real.

## Como rodar
1. Instale Node.js 20.19+ ou 22+.
2. Crie um projeto em https://supabase.com e obtenha URL e chave **publishable/anon** (nunca a service_role).
3. No SQL Editor do Supabase, execute `supabase/migrations/001_initial.sql`.
4. No painel Authentication > Providers, configure Email. Em ambiente de teste, confirme os emails ou desative temporariamente a exigência de confirmação.
5. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
6. Execute `npm install` e `npm run dev`.
7. Abra o endereço indicado pelo Vite, crie uma conta, crie campeonato e compartilhe o link público.
8. Antes de publicar, execute `npm run build`.

## Teste sugerido
- Crie a Copa Vôlei Assis, areia 4×4, R$120, 16 vagas.
- Abra o link público em janela anônima e cadastre 4 atletas.
- Verifique a inscrição no painel e no link de status.
- **Aprovação ficará bloqueada** enquanto não houver integração PIX real.
- Crie outro campeonato gratuito (R$0), faça uma inscrição e aprove pelo painel.
- Confirme que outro organizador não consegue ver/alterar inscrições de terceiros.

## Limitações e segurança
- A RPC `register_team` permite inscrições públicas. Antes de produção, adicionar CAPTCHA/Turnstile, rate limiting e monitoramento anti-spam na borda/servidor.
- O link individual de status contém um UUID não adivinhável, mas é um segredo de acesso; não o publique.
- Dados pessoais de atletas: definir política de privacidade, retenção, exclusão, base legal e tratamento de menores conforme LGPD.
- Sem PIX real, comprovantes, reembolsos, confirmação de pagamentos, reservas temporárias ou integração de conta do organizador.
- A tabela `organizer_payment_accounts` é apenas preparação. Conexão real precisa de OAuth/onboarding do provedor, backend seguro, webhooks assinados, idempotência e verificação de recebedor.
- Não inclui ainda grupos, jogos, placares e classificação online: essas funções são da etapa posterior.
- O cadastro público usa quantidade exata de titulares (2/4/6), sem reservas; regras de equipes e categorias deverão ser refinadas.
- A RLS protege as inscrições. Revise as políticas com testes de segurança antes de produção.
