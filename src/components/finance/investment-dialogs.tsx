import { type FormEvent, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveInvestment,
  savePatrimonyGoal,
  type InvestmentRecord,
} from "@/lib/investments.functions";
import {
  INVESTMENT_TYPES,
  INVESTMENT_TYPE_LABELS,
  type InvestmentType,
} from "@/lib/investment-types";
import { MAX_INVESTMENT_CENTS, MAX_PATRIMONY_TARGET_CENTS } from "@/lib/investment-types";

export function InvestmentFormDialog({
  open,
  companyId,
  investment,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  investment: InvestmentRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveInvestment);
  const [name, setName] = useState("");
  const [type, setType] = useState<InvestmentType>("renda_fixa");
  const [institution, setInstitution] = useState("");
  const [valueCents, setValueCents] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(investment?.name || "");
    setType(investment?.type || "renda_fixa");
    setInstitution(investment?.institution || "");
    setValueCents(investment?.valueCents ?? null);
  }, [investment, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome do investimento.");
      return;
    }
    if (valueCents == null) {
      toast.error("Informe o valor atual do investimento.");
      return;
    }
    setSaving(true);
    try {
      await save({
        data: {
          companyId,
          investmentId: investment?.id ?? null,
          name,
          type,
          institution: institution || null,
          valueCents,
        },
      });
      toast.success(investment ? "Investimento atualizado." : "Investimento registrado.");
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar o investimento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-black">
            {investment ? "Editar investimento" : "Novo investimento"}
          </DialogTitle>
          <DialogDescription>
            Registre o saldo atual. Você pode atualizar esse valor sempre que quiser.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="investment-name">Nome do investimento</Label>
            <Input
              id="investment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: CDB, Tesouro Selic, ações"
              maxLength={100}
              className="mt-1 h-10 rounded-xl"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(value) => setType(value as InvestmentType)}>
                <SelectTrigger className="mt-1 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVESTMENT_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {INVESTMENT_TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="investment-institution">Instituição (opcional)</Label>
              <Input
                id="investment-institution"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
                placeholder="Ex.: corretora ou banco"
                maxLength={120}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="investment-value">Valor atual</Label>
            <MoneyInput
              id="investment-value"
              aria-label="Valor atual do investimento"
              cents={valueCents}
              onChange={setValueCents}
              required
              allowZero
              maxCents={MAX_INVESTMENT_CENTS}
              className="mt-1 h-10 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-xl bg-[color:var(--brand)]"
          >
            {saving ? "Salvando…" : investment ? "Salvar alterações" : "Registrar investimento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PatrimonyGoalDialog({
  open,
  companyId,
  currentTargetCents,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  currentTargetCents: number;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const save = useServerFn(savePatrimonyGoal);
  const [targetCents, setTargetCents] = useState<number | null>(currentTargetCents);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setTargetCents(currentTargetCents);
  }, [currentTargetCents, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (targetCents == null) {
      toast.error("Informe o valor da meta ou R$ 0,00 para removê-la.");
      return;
    }
    setSaving(true);
    try {
      await save({ data: { companyId, targetCents } });
      toast.success(
        targetCents > 0 ? "Meta patrimonial atualizada." : "Meta patrimonial removida.",
      );
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-black">Meta de patrimônio</DialogTitle>
          <DialogDescription>
            A barra compara sua meta com a soma dos valores atuais cadastrados em Investimentos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="patrimony-target">Valor da meta</Label>
            <MoneyInput
              id="patrimony-target"
              aria-label="Valor da meta de patrimônio"
              cents={targetCents}
              onChange={setTargetCents}
              required
              allowZero
              maxCents={MAX_PATRIMONY_TARGET_CENTS}
              className="mt-1 h-10 rounded-xl"
            />
            <p className="mt-1 text-xs text-muted-foreground">Use R$ 0,00 para remover a meta.</p>
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-xl bg-[color:var(--brand)]"
          >
            {saving ? "Salvando…" : "Salvar meta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
