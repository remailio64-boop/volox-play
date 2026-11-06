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
