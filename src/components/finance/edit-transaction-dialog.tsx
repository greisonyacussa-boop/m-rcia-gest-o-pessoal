import { type FormEvent, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  updateFinanceTransaction,
  type FinanceTransactionDetail,
} from "@/lib/finance-dashboard.functions";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance-period";

type EditTransactionData = {
  categories: Array<{ id: string; name: string; color: string; type: string; active: boolean }>;
};

export function EditTransactionDialog({
  companyId,
  data,
  item,
  onOpenChange,
  onSaved,
}: {
  companyId: string;
  data: EditTransactionData;
  item: FinanceTransactionDetail;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const update = useServerFn(updateFinanceTransaction);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"receita" | "despesa">(item.type);
  const [description, setDescription] = useState(item.description);
  const [merchant, setMerchant] = useState(item.merchant || "");
  const [amountCents, setAmountCents] = useState<number | null>(item.amountCents);
  const [date, setDate] = useState(item.date);
  const [categoryId, setCategoryId] = useState(item.categoryId || "none");
  const [paymentMethod, setPaymentMethod] = useState(item.paymentMethod || "nao_informado");
  const [note, setNote] = useState(item.note || "");

  useEffect(() => {
    setType(item.type);
    setDescription(item.description);
    setMerchant(item.merchant || "");
    setAmountCents(item.amountCents);
    setDate(item.date);
    setCategoryId(item.categoryId || "none");
    setPaymentMethod(item.paymentMethod || "nao_informado");
    setNote(item.note || "");
  }, [item]);

  const categories = data.categories.filter(
    (category) =>
      (category.active || category.id === categoryId) &&
      (category.type === type || category.type === "ambos" || category.id === categoryId),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amountCents == null || amountCents <= 0) {
      toast.error("Informe um valor maior que zero, por exemplo R$ 87,50.");
      return;
    }
    setSaving(true);
    try {
      await update({
        data: {
          companyId,
          transactionId: item.id,
          type,
          description,
          amountCents,
          date,
          categoryId: categoryId === "none" ? null : categoryId,
          paymentMethod: paymentMethod === "nao_informado" ? null : paymentMethod,
          merchant: merchant || null,
          note: note || null,
        },
      });
      toast.success("Lançamento atualizado.");
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o lançamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!saving) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-black">Editar lançamento</DialogTitle>
          <DialogDescription>
            Corrija os dados e escolha a forma de pagamento. A data atualiza a competência; datas
            diferentes de vencimento ou pagamento são preservadas.
          </DialogDescription>
          {item.cardLinked && (
            <p className="text-xs text-muted-foreground">
              Vinculado a uma fatura de cartão: valor, tipo, competência e forma ficam bloqueados
              para preservar o total da fatura.
            </p>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["despesa", "receita"] as const).map((value) => (
              <button
                type="button"
                key={value}
                disabled={Boolean(item.cardLinked)}
                aria-pressed={type === value}
                onClick={() => {
                  const selected = data.categories.find((category) => category.id === categoryId);
                  setType(value);
                  if (selected && selected.type !== "ambos" && selected.type !== value) {
                    setCategoryId("none");
                  }
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
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ex.: Mercado"
                className="mt-1 h-10 rounded-xl"
                required
              />
            </div>
            <div>
              <Label>Estabelecimento</Label>
              <Input
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
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
                disabled={Boolean(item.cardLinked)}
                required
                allowZero={false}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
            <div>
              <Label>Data da competência</Label>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={Boolean(item.cardLinked)}
                className="mt-1 h-10 rounded-xl"
                required
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                      {!category.active ? " (inativa)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                disabled={Boolean(item.cardLinked)}
              >
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
              {item.cardLinked && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Vinculado a uma fatura de cartão; a forma fica bloqueada para preservar essa
                  relação.
                </p>
              )}
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opcional"
              className="mt-1 min-h-[64px] rounded-xl"
            />
          </div>
          <Button disabled={saving} className="h-10 w-full rounded-xl bg-[color:var(--brand)]">
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
