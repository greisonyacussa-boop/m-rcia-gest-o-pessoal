import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  validateFinanceCategoryDraft,
  type FinanceCategoryDraft,
  type FinanceCategoryType,
} from "@/lib/finance-category-rules";

export type FinanceCategoryItem = {
  id: string;
  name: string;
  color: string;
  type: string;
};

export type SaveFinanceCategory = (input: FinanceCategoryDraft) => Promise<FinanceCategoryItem>;

type FinanceCategoryDialogProps = {
  categories: readonly FinanceCategoryItem[];
  onSave: SaveFinanceCategory;
  trigger?: ReactNode;
  initialType?: FinanceCategoryType;
  fixedType?: FinanceCategoryType;
  title?: string;
  description?: string;
};

const CATEGORY_COLORS = [
  "#7C3AED",
  "#10B981",
  "#0EA5E9",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
];

function typeLabel(type: string) {
  if (type === "receita") return "Entrada";
  if (type === "despesa") return "Saída";
  return "Entrada e saída";
}

/** Painel sem acesso a credenciais: o fluxo real/demo injeta apenas onSave. */
export function FinanceCategoryDialog({
  categories,
  onSave,
  trigger,
  initialType = "despesa",
  fixedType,
  title = "Categorias financeiras",
  description = "Crie categorias para organizar entradas e saídas do seu jeito.",
}: FinanceCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FinanceCategoryType>(fixedType ?? initialType);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (first, second) =>
          typeLabel(first.type).localeCompare(typeLabel(second.type), "pt-BR") ||
          first.name.localeCompare(second.name, "pt-BR"),
      ),
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    setName("");
    setType(fixedType ?? initialType);
    setColor(CATEGORY_COLORS[0]);
    setFormError("");
  }, [open, fixedType, initialType]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React events from the portaled dialog otherwise bubble to a surrounding form.
    event.stopPropagation();
    if (saving) return;
    setFormError("");
    try {
      const draft = validateFinanceCategoryDraft({
        name,
        type: fixedType ?? type,
        color,
      });
      setSaving(true);
      await onSave(draft);
      setOpen(false);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Não foi possível criar a categoria.");
    } finally {
      setSaving(false);
    }
  }

  const triggerElement = trigger ?? (
    <Button type="button" size="sm" variant="outline" className="rounded-xl">
      <Tags /> Categorias
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{triggerElement}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-black">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Catálogo atual
            </p>
            {sortedCategories.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2"
                  >
                    <span
                      className="size-3 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: category.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {category.name}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                      {typeLabel(category.type)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma categoria personalizada ainda.
              </p>
            )}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="finance-category-name">Nova categoria</Label>
              <Input
                id="finance-category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Viagens"
                maxLength={60}
                className="mt-1 h-10 rounded-xl"
                autoFocus
                required
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Até 60 caracteres.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="finance-category-type">Tipo</Label>
                {fixedType ? (
                  <div className="mt-1 flex h-10 items-center rounded-xl border border-border bg-muted/30 px-3 text-sm font-bold">
                    {typeLabel(fixedType)}
                  </div>
                ) : (
                  <Select
                    value={type}
                    onValueChange={(value) => setType(value as FinanceCategoryType)}
                  >
                    <SelectTrigger id="finance-category-type" className="mt-1 h-10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="despesa">Saída</SelectItem>
                      <SelectItem value="receita">Entrada</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label htmlFor="finance-category-color">Cor</Label>
                <div className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-border px-2">
                  <input
                    id="finance-category-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value.toUpperCase())}
                    className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label="Cor da categoria"
                  />
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {color}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Sugestões de cor</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    className={`size-7 rounded-full border-2 transition-transform hover:scale-105 ${color === preset ? "border-foreground ring-2 ring-ring/30" : "border-transparent"}`}
                    style={{ backgroundColor: preset }}
                    aria-label={`Usar cor ${preset}`}
                    aria-pressed={color === preset}
                  />
                ))}
              </div>
            </div>

            {formError ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
              >
                {formError}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={saving}
              className="h-10 w-full rounded-xl bg-[color:var(--brand)]"
            >
              <Plus /> {saving ? "Salvando…" : "Salvar categoria"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
