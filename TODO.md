# Melhorias financeiras solicitadas

- [x] **Saldo entre meses:** “Quero que saldo disponível que sobra de meses anterior fique no mês seguinte.” Mostrar e acumular o saldo realizado de competências anteriores no disponível do período selecionado; manter entradas e saídas do período separadas, pendentes/atrasadas apenas na previsão, ignorar cancelados e não criar lançamentos artificiais.
- [x] **Novas categorias:** “Que me dê opções de cadastra novas categorias.” Permitir que owner/admin cadastre categorias de entrada ou saída com nome e cor; validar no servidor, manter o isolamento por empresa e usar categoria recém-criada imediatamente no lançamento. Oferecer no demo uma lista fictícia local, sem escrita no banco.

Preservar recursos financeiros já existentes no repositório Lovable, inclusive edição, cancelamento, categorias ativas e vínculos com cartões; não publicar pelo Lovable.

Verificações: 22 testes unitários passaram; `tsc --noEmit` passou; ESLint não encontrou erros (com um aviso de Fast Refresh no módulo de visão existente). O verificador `test:finance-rebuild` não pôde executar porque este clone não contém `supabase/migrations/20261018120000_marcia_finance_foundation.sql`; não foi feita escrita nem validação de integração no banco.
