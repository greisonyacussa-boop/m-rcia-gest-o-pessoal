import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatMoney as financeMoney } from "@/components/finance/finance-states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { markFinanceCardPaid } from "@/lib/finance-card-payment.functions";

export function FinanceCardPaymentPanel({
  companyId,
  accounts,
  pendingTotalCents,
  pendingCount,
  onPaid,
}: {
  companyId: string;
  accounts: Array<{ id: string; name: string }>;
  pendingTotalCents: number;
  pendingCount: number;
  onPaid: () => void;
}) {
  const pay = useServerFn(markFinanceCardPaid);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accounts.some((account) => account.id === accountId)) {
      setAccountId(accounts[0]?.id || "");
    }
  }, [accountId, accounts]);

  async function confirmPayment(event: FormEvent) {
    event.preventDefault();
    if (!accountId) {
      toast.error("Escolha a conta de onde saiu o pagamento.");
      return;
    }
    setSaving(true);
    try {
      const result = await pay({ data: { companyId, accountId } });
      if (result.paidCount > 0) {
        const accountName = accounts.find((account) => account.id === accountId)?.name;
        toast.success(
          `${financeMoney(result.paidCents)} marcados como pagos${accountName ? ` na conta ${accountName}` : ""}.`,
        );
      } else {
        toast.info("Não há gastos no cartão aguardando pagamento.");
      }
      setOpen(false);
      onPaid();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o pagamento do cartão.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 sm:flex-row sm:items-center dark:border-violet-900 dark:bg-violet-950/20">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200">
        <CreditCard className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-black">Gastos no cartão de crédito</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} gasto(s), ${financeMoney(pendingTotalCents)} acumulados de todos os meses aguardando pagamento. O saldo só é abatido quando você confirmar.`
            : "Nenhuma compra aguarda pagamento. Novas compras começam um novo acumulado."}
        </p>
      </div>
      {pendingCount > 0 && accounts.length > 0 ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              size="sm"
              className="shrink-0 rounded-xl bg-violet-700 hover:bg-violet-800"
            >
              Marcar cartão como pago
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Registrar pagamento do cartão</DialogTitle>
              <DialogDescription>
                O total acumulado de {financeMoney(pendingTotalCents)} será abatido uma única vez da
                conta escolhida. Este botão registra que você já pagou; não envia dinheiro ao banco.
                Limite e vencimento não acionam a baixa.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={confirmPayment} className="space-y-4">
              <div>
                <Label>Conta usada para pagar</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1 h-10 rounded-xl">
                    <SelectValue placeholder="Selecione uma conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={saving || !accountId}
                className="w-full rounded-xl bg-violet-700 hover:bg-violet-800"
              >
                {saving ? "Registrando…" : "Confirmar que o cartão foi pago"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : pendingCount > 0 ? (
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          Cadastre uma conta ativa para registrar a quitação.
        </p>
      ) : null}
    </section>
  );
}
