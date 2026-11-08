# VoloxPlay

Aplicativo React + TypeScript + Supabase para torneios de vôlei e Beach Tennis.

## Disponível

- Acesso de organizadores, recuperação de senha e reenvio de confirmação de e-mail.
- Criação de campeonatos mediante cobrança de R$ 29,90 ao organizador pelo Mercado Pago. A liberação depende do webhook assinado e do pagamento aprovado pelo provedor.
- Publicação e ocultação pelo proprietário do torneio, preservando inscrições e resultados. Rascunhos não aparecem no catálogo público e não recebem inscrições.
- Categorias de quadra 6×6, areia 2×2 e 4×4, Beach Tennis simples e duplas.
- Inscrição pública, limite de vagas, acompanhamento por link privado e aprovação pelo organizador.
- Inscrição gratuita ou pagamento direto à organização, com orientações públicas configuráveis. A conferência do recebimento é **manual**, com autor e horário registrados no servidor. O aplicativo não consulta a conta bancária e não processa automaticamente a inscrição do atleta.
- Chaves, placares, classificação, semifinais, final, terceiro lugar, pódio e publicação dos resultados.
- Favoritos e histórico de inscrições salvos no navegador. Não são sincronizados entre aparelhos.

## Desenvolvimento

Use Node.js 20.19+ ou 22+, instale com `npm ci` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`). Nunca use uma chave service_role no frontend. O projeto requer o banco existente com suas tabelas, políticas e RPCs; as migrações deste repositório são incrementais, não um bootstrap completo.

Execute `npm run dev`, `npm test` e `npm run build`. As migrações novas estão em `supabase/migrations`. O teste `tests/database-flow.sql` usa um helper temporário e desfaz todas as suas fixtures; cobre inscrição, privacidade, autorização, confirmação manual auditada, aprovação, vagas e rascunhos.

## Pagamentos e acesso

A cobrança de R$ 29,90 ao organizador é separada das inscrições dos atletas. Não marcar pagamentos como aprovados para contornar a cobrança. Os atletas pagam diretamente à organização; a confirmação manual só deve ser usada depois de verificar o crédito. A integração automática por organizador exige onboarding autorizado da conta do provedor e webhooks próprios.

O link privado de acompanhamento contém um identificador de acesso e não deve ser divulgado publicamente. Os e-mails de confirmação e recuperação dependem da configuração, limites e entrega do Supabase Auth; a aplicação não deve afirmar que uma mensagem chegou sem verificar a caixa de entrada.


## Contas e ranking dos atletas

A versão de contas acrescenta `/atleta`, `/ranking` e `/atletas/:code`. A autenticação continua no Supabase Auth: atleta e organizador podem usar o mesmo acesso. `preferred_view` serve somente para navegação, nunca para autorizar dados.

Cada perfil possui identidade estável por usuário e exibição pública desligada por padrão. O capitão busca os parceiros pelo nome e pode filtrar pela cidade; os parceiros confirmam os convites em suas próprias contas. O identificador interno de 12 caracteres continua vinculando resultados sem aparecer nos formulários. A busca exige login, retorna no máximo 12 nomes/cidades e inclui somente perfis públicos ou que autorizaram separadamente a busca (`allow_partner_search`, desligado por padrão). A autorização para busca não publica o histórico nem amplia o acesso direto à tabela de perfis. O histórico é consultado no banco, independentemente do aparelho. As inscrições antigas sem contas vinculadas continuam preservadas e não recebem vínculos automáticos por semelhança de nome.

Os pontos por atleta são 100/70/50/30 para as quatro primeiras colocações e 10 para os demais participantes sorteados. O organizador precisa confirmar os pontos após finalizar as chaves, semifinais, final e terceiro lugar. A confirmação é idempotente. Alterações nos placares suspendem os pontos até nova confirmação; confrontos finais inconsistentes com as semifinais impedem a confirmação. O ranking público agrupa por modalidade e nome normalizado da categoria e respeita a opção de exibição pública e a publicação dos resultados. A conta guarda o histórico mesmo quando o atleta oculta seu perfil público.

As inscrições individuais de categorias `drawn` também são vinculadas à conta. As duplas e os quartetos são formados aleatoriamente a partir dos atletas aprovados e seguem para o sorteio das chaves. Os pontos da equipe são atribuídos individualmente aos integrantes, e o histórico da conta mostra uma única participação, sem duplicar o cadastro individual e a equipe gerada.

`tests/athlete-ranking-db.sql` oferece um teste transacional completo com perfis, inscrições, convites, jogos e ranking. Execute `select pg_temp.test_athlete_rankings();` após carregar o arquivo em uma sessão de teste com a migração aplicada. Também aceita a migração inteira no argumento `p_setup` e a instala dentro do bloco desfeito ao final. Nenhum usuário, perfil ou torneio de teste é mantido. Os usuários simulados no banco não substituem um teste de cadastro e entrega de e-mail reais.


## Equipes sorteadas e fechamento desta versão

A migração `20261107235915_complete_drawn_competitions.sql` distingue inscrições individuais pagáveis (`individual`) e equipes geradas para a competição (`drawn_team`). O sorteio é único por categoria, usa somente atletas aprovados e exige quantidade múltipla de 2 ou 4, com pelo menos quatro equipes completas. A formação da equipe não cria cobrança nem transforma uma inscrição pendente em paga. Após formar as equipes, novas inscrições e alterações de situação dos participantes ficam bloqueadas. O organizador confere os integrantes e realiza o sorteio das chaves separadamente.

Novos sorteios de chaves usam duas chaves equilibradas com no mínimo duas equipes em cada uma, permitindo semifinais, final e terceiro lugar inclusive com quatro ou nove equipes. Sorteios já existentes são preservados. As consultas públicas de equipes ocultam os nomes de perfis reservados; o próprio atleta vê seus parceiros quando conectado e o organizador vê a composição completa.

O recebimento das inscrições continua **manual por decisão da usuária**: pagamento direto à organização, conferência do crédito e registro no aplicativo. A taxa de uso do aplicativo pelo organizador é um fluxo separado. A entrega de um e-mail de cadastro real precisa ser confirmada pelo destinatário; testes simulados no banco não comprovam essa entrega.

`tests/partner-search-db.sql` valida busca com acentos/cidade, privacidade, revogação de consentimento, limite de resultados e confirmação de convites. Todas as contas e inscrições simuladas são desfeitas ao final.
