# Melhorias financeiras solicitadas

- [x] **Saldo entre meses:** “Quero que saldo disponível que sobra de meses anterior fique no mês seguinte.” Mostrar e acumular o saldo realizado de competências anteriores no disponível do período selecionado; manter entradas e saídas do período separadas, pendentes/atrasadas apenas na previsão, ignorar cancelados e não criar lançamentos artificiais.
- [x] **Novas categorias:** “Que me dê opções de cadastra novas categorias.” Permitir que owner/admin cadastre categorias de entrada ou saída com nome e cor; validar no servidor, manter o isolamento por empresa e usar categoria recém-criada imediatamente no lançamento. Oferecer no demo uma lista fictícia local, sem escrita no banco.

Preservar recursos financeiros já existentes no repositório Lovable, inclusive edição, cancelamento, categorias ativas e vínculos com cartões; não publicar pelo Lovable.

Verificações atuais: 41 testes direcionados passaram; `tsc --noEmit` passou; ESLint sem erros (4 avisos de Fast Refresh); Prettier e `git diff --check` passaram. A migration de quitação precisa ser aplicada pelo ambiente Supabase/Lovable; este clone não contém as migrations-base e o trigger de saldo, então a execução da RPC e a baixa real da conta não foram validadas no banco. Não houve escrita no banco.

## Nova solicitação: gastos no cartão de crédito

- [x] **Não descontar antes da quitação:** “quando eu gastar no cartão de crédito não abater no saldo da conta até eu por que o cartão foi pago” e “não preços por limites e nem data, eu vou registra os gastos no cartão e o valor total só vai ser abatido do saldo quando clicar que o cartão foi pago”. Novas despesas registradas como “Cartão” permanecem fora do caixa até uma ação manual explícita; não liquidar por limite, vencimento ou passagem de data. Ao confirmar, selecionar uma conta ativa e liquidar apenas os gastos ainda pendentes, uma única vez e dentro da empresa correta. Inclui custos de OS com forma de pagamento própria no formulário e no comando por texto/voz, sem confundir a forma escolhida pelo cliente para a receita; registrar o custo mesmo quando a receita da OS for zero e preservar um valor final explicitamente informado como zero, sem trocá-lo por preço sugerido.
- [x] **Gráfico de gastos:** “na tela no gráfico amostra o que foi gasto em cartão”. Mostrar as compras de cartão numa série distinta da saída da conta; a linha do saldo só reduz na liquidação manual. Manter gastos/categorias por data de compra e preservar as outras séries.
- [x] **Demo e histórico:** manter a demonstração fictícia sem escrita no banco e sem regra automática de pagamento; não reescrever lançamentos antigos sem confirmação do estado das respectivas faturas.
