/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Mic, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { brandedRouteHead } from "@/config/brand";
import { useBrand } from "@/contexts/brand-context";
import { PageHeader } from "@/components/marcia/page-kit";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinanceEmpty, FinanceError, FinanceLoading } from "@/components/finance/finance-states";
import { EditTransactionDialog } from "@/components/finance/edit-transaction-dialog";
import {
  FinanceCategoryDialog,
  type FinanceCategoryItem,
} from "@/components/finance/finance-category-dialog";
import { TransactionsView } from "@/components/finance/transactions-view";
import {
  addFinanceTransaction,
  cancelFinanceTransaction,
  listFinanceTransactions,
  type FinanceTransactionDetail,
} from "@/lib/finance-dashboard.functions";
import { markFinanceCardPaid } from "@/lib/finance-card-payment.functions";
import { createFinanceCategory } from "@/lib/finance-categories.functions";
import {
  canManageFinanceCategories,
  type FinanceCategoryDraft,
} from "@/lib/finance-category-rules";
import {
  PAYMENT_METHOD_LABELS,
  resolveFinancePeriod,
  toIsoDate,
  type FinancePeriod,
} from "@/lib/finance-period";

export const Route = createFileRoute("/app/movimentacoes")({
  head: brandedRouteHead("Movimentações"),
  component: TransactionsPage,
});

type Payload = {
  items: FinanceTransactionDetail[];
  categories: Array<{ id: string; name: string; color: string; type: string; active: boolean }>;
  accounts: Array<{ id: string; name: string }>;
  unpaidCardCents: number;
  unpaidCardCount: number;
};

function TransactionsPage() {
  const branding = useBrand();
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const list = useServerFn(listFinanceTransactions);
  const cancel = useServerFn(cancelFinanceTransaction);
  const createCategory = useServerFn(createFinanceCategory);
  const canManageCategories = canManageFinanceCategories(ctx.membership?.role);
  const [period, setPeriod] = useState<FinancePeriod>(() => resolveFinancePeriod("this_month"));
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingItem, setEditingItem] = useState<FinanceTransactionDetail | null>(null);
  const [deletingItem, setDeletingItem] = useState<FinanceTransactionDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!companyId) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await list({ data: { companyId, from: period.from, to: period.to } });
      if (requestSequence.current === requestId) setData(next);
    } catch (e: any) {
      if (requestSequence.current === requestId) {
        setError(e?.message || "Não foi possível carregar as movimentações.");
      }
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [companyId, list, period.from, period.to]);

  const saveCategory = useCallback(
    async (draft: FinanceCategoryDraft): Promise<FinanceCategoryItem> => {
      if (!companyId) throw new Error("Empresa não informada.");
      const created = await createCategory({ data: { companyId, ...draft } });
      setData((current) =>
        current
          ? {
              ...current,
              categories: [
                ...current.categories.filter((category) => category.id !== created.id),
                { ...created, active: true },
              ],
            }
          : current,
      );
      window.dispatchEvent(new CustomEvent("marcia:finance-updated"));
      return created;
    },
    [companyId, createCategory],
  );

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener("marcia:finance-updated", onUpdate);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener("marcia:finance-updated", onUpdate);
    };
  }, [refresh]);

  async function confirmDelete() {
    const item = deletingItem;
    if (!companyId || !item) return;
    setDeleting(true);
    try {
      await cancel({ data: { companyId, transactionId: item.id } });
      toast.success("Lançamento removido do extrato.");
      setDeletingItem(null);
      window.dispatchEvent(new CustomEvent("marcia:finance-updated"));
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível remover o lançamento.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Seu extrato"
        title="Movimentações"
        description="Tudo que entrou pelo chat, WhatsApp, foto ou registro manual, com todos os detalhes."
        action={
          <div className="flex flex-wrap gap-2">
            {canManageCategories && data ? (
              <FinanceCategoryDialog
                categories={data.categories}
                onSave={saveCategory}
                trigger={
                  <Button type="button" size="sm" variant="outline" className="rounded-xl">
                    <Tags /> Categorias
                  </Button>
                }
              />
            ) : null}
            <Button asChild size="sm" variant="outline" className="rounded-xl">
              <Link to="/app/marcia">
                <Mic /> Registrar falando
              </Link>
            </Button>
            {companyId && data && (
              <NewTransactionDialog
                companyId={companyId}
                data={data}
                canManageCategories={canManageCategories}
                onCategoryCreated={saveCategory}
                onCreated={() => window.dispatchEvent(new CustomEvent("marcia:finance-updated"))}
              />
            )}
          </div>
        }
      />
      {data && companyId ? (
        <CardPaymentPanel
          companyId={companyId}
          data={data}
          onPaid={() => window.dispatchEvent(new CustomEvent("marcia:finance-updated"))}
        />
      ) : null}
      {loading && !data ? (
        <FinanceLoading />
      ) : error && !data ? (
        <FinanceError message={error} retry={refresh} />
      ) : data ? (
        <TransactionsView
          items={data.items}
          period={period}
          onPeriodChange={setPeriod}
          loading={loading}
          onEdit={setEditingItem}
          onDelete={setDeletingItem}
          emptyState={
            <FinanceEmpty
              title="Nenhuma movimentação neste período"
              description={`Comece falando do seu jeito. ${branding.assistantName} organiza valor, data, categoria e forma de pagamento antes de salvar.`}
              example="Gastei 87 na farmácia hoje no Pix"
            />
          }
        />
      ) : null}
      {data && companyId && editingItem && (
        <EditTransactionDialog
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
          companyId={companyId}
          data={data}
          item={editingItem}
          onSaved={() => {
            setEditingItem(null);
            window.dispatchEvent(new CustomEvent("marcia:finance-updated"));
          }}
        />
      )}
      <AlertDialog
        open={Boolean(deletingItem)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingItem(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele sairá do extrato e dos cálculos, mas ficará marcado como cancelado para preservar
              o histórico e ajustar o saldo da conta. Se estiver ligado a uma ordem de serviço, a
              ordem continuará registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Removendo…" : "Remover lançamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatCents(value: number) {
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CardPaymentPanel({
  companyId,
  data,
  onPaid,
}: {
  companyId: string;
  data: Payload;
  onPaid: () => void;
}) {
  const pay = useServerFn(markFinanceCardPaid);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data.accounts.some((account) => account.id === accountId)) {
      setAccountId(data.accounts[0]?.id || "");
    }
  }, [accountId, data.accounts]);

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
        const accountName = data.accounts.find((account) => account.id === accountId)?.name;
        toast.success(
          `${formatCents(result.paidCents)} marcados como pagos${accountName ? ` na conta ${accountName}` : ""}.`,
        );
      } else {
        toast.info("Não há gastos no cartão aguardando pagamento.");
      }
      setOpen(false);
      onPaid();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível registrar o pagamento do cartão.");
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
          {data.unpaidCardCount > 0
            ? `${data.unpaidCardCount} gasto(s), ${formatCents(data.unpaidCardCents)} aguardando pagamento. O saldo só é abatido quando você confirmar.`
            : "Novas compras no cartão aparecem separadas e não reduzem o saldo até a confirmação manual."}
        </p>
      </div>
      {data.unpaidCardCount > 0 && data.accounts.length > 0 ? (
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
                O total de {formatCents(data.unpaidCardCents)} será abatido uma única vez da conta
                escolhida. Este botão só registra que você já pagou; não envia dinheiro ao banco.
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
                    {data.accounts.map((account) => (
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
      ) : data.unpaidCardCount > 0 ? (
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          Cadastre uma conta ativa para registrar a quitação.
        </p>
      ) : null}
    </section>
  );
}

function NewTransactionDialog({
  companyId,
  data,
  canManageCategories,
  onCategoryCreated,
  onCreated,
}: {
  companyId: string;
  data: Payload;
  canManageCategories: boolean;
  onCategoryCreated: (draft: FinanceCategoryDraft) => Promise<FinanceCategoryItem>;
  onCreated: () => void;
}) {
  const add = useServerFn(addFinanceTransaction);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [categoryId, setCategoryId] = useState("none");
  const [paymentMethod, setPaymentMethod] = useState("nao_informado");
  const [note, setNote] = useState("");
  const categories = data.categories.filter(
    (c) => c.active && (c.type === type || c.type === "ambos"),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amountCents == null || amountCents <= 0) {
      toast.error("Informe um valor maior que zero, por exemplo R$ 87,50.");
      return;
    }
    setSaving(true);
    try {
      await add({
        data: {
          companyId,
          type,
          description,
          amountCents,
          date,
          categoryId: categoryId === "none" ? null : categoryId,
          paymentMethod: paymentMethod === "nao_informado" ? null : paymentMethod,
          merchant: merchant || null,
          note: note || null,
          status: "pago",
          source: "manual",
        } as any,
      });
      toast.success(
        type === "receita"
          ? "Entrada registrada."
          : paymentMethod === "cartao"
            ? "Gasto no cartão registrado; o saldo será abatido quando você marcar que foi pago."
            : "Saída registrada.",
      );
      setOpen(false);
      setDescription("");
      setMerchant("");
      setAmountCents(null);
      setPaymentMethod("nao_informado");
      setNote("");
      onCreated();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl bg-[color:var(--brand)]">
          <Plus /> Novo lançamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-black">Novo lançamento</DialogTitle>
          <DialogDescription>Registro manual. Pelo chat é ainda mais rápido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["despesa", "receita"] as const).map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setType(value);
                  setCategoryId("none");
                }}
                className={`rounded-xl border px-4 py-2.5 text-sm font-extrabold ${type === value ? (value === "receita" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800") : "border-border"}`}
              >
                {value === "receita" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Descrição</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Mercado"
                className="mt-1 h-10 rounded-xl"
                required
              />
            </div>
            <div>
              <Label>Estabelecimento</Label>
              <Input
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="Opcional"
                className="mt-1 h-10 rounded-xl"
              />
            </div>
            <div>
              <Label>Valor</Label>
              <MoneyInput
                aria-label="Valor"
                cents={amountCents}
                onChange={setAmountCents}
                required
                allowZero={false}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-10 rounded-xl"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Categoria</Label>
                {canManageCategories ? (
                  <FinanceCategoryDialog
                    categories={data.categories}
                    fixedType={type}
                    onSave={async (draft) => {
                      const created = await onCategoryCreated(draft);
                      setCategoryId(created.id);
                      return created;
                    }}
                    title={`Nova categoria de ${type === "receita" ? "entrada" : "saída"}`}
                    description="Ela ficará selecionada neste lançamento sem apagar os outros campos."
                    trigger={
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto px-0 text-xs font-extrabold text-[color:var(--brand-text)]"
                      >
                        <Plus /> Nova categoria
                      </Button>
                    }
                  />
                ) : null}
              </div>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="mt-1 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_informado">Não informada</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Selecione Pix, cartão, dinheiro ou outra forma. O app não marca Pix por padrão.
              </p>
              {type === "despesa" && paymentMethod === "cartao" ? (
                <p className="mt-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                  A compra ficará separada do saldo até você marcar o cartão como pago.
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opcional"
              className="mt-1 min-h-[64px] rounded-xl"
            />
          </div>
          <Button disabled={saving} className="h-10 w-full rounded-xl bg-[color:var(--brand)]">
            {saving ? "Salvando…" : "Salvar lançamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
