import { AlertTriangle } from "lucide-react";
import { trialDaysLeft, type CompanyRow } from "@/lib/tenant";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyCredits } from "@/lib/credits.functions";

export function TrialBanner({ company }: { company: CompanyRow }) {
  const fetchCredits = useServerFn(getMyCredits);
  const [credits, setCredits] = useState<number | null>(company.creditos_saldo ?? null);
  const [billingStatus, setBillingStatus] = useState(company.status_cobranca);

  useEffect(() => {
    setBillingStatus(company.status_cobranca);
  }, [company.id, company.status_cobranca]);

  useEffect(() => {
    if (billingStatus !== "trial") return;
    let active = true;
    const load = () =>
      void fetchCredits({ data: { companyId: company.id } })
        .then((result) => {
          if (!active) return;
          setCredits(result.saldo);
          if (result.status_cobranca && result.status_cobranca !== "trial") {
            setBillingStatus(result.status_cobranca as CompanyRow["status_cobranca"]);
          }
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [company.id, billingStatus, fetchCredits]);

  if (billingStatus !== "trial") return null;
  const days = trialDaysLeft(company.trial_ate);
  const creditLabel =
    credits === null ? "carregando saldo" : `${credits.toLocaleString("pt-BR")} créditos`;

  return (
    <div className="flex flex-col items-center justify-center gap-2 border-b border-red-800 bg-red-600 px-4 py-2.5 text-center text-sm font-medium text-white sm:flex-row sm:text-left">
      <AlertTriangle className="hidden size-4 shrink-0 sm:block" />
      <div>
        <span className="font-extrabold uppercase tracking-wide">Trial</span>
        {days > 0 ? (
          <>
            {" · "}restam{" "}
            <b>
              {days} {days === 1 ? "dia" : "dias"}
            </b>
            {" · "}
            <b>{creditLabel}</b> disponíveis
          </>
        ) : (
          <> · período encerrado</>
        )}
        <span className="block text-[11px] font-normal text-red-50 sm:ml-2 sm:inline">
          1 crédito = 1 resposta enviada pela IA no WhatsApp.
          {credits === 0 ? " A IA está pausada até a ativação do plano." : ""}
        </span>
      </div>
      <Link
        to="/app/checkout"
        className="inline-flex shrink-0 items-center rounded-md bg-white px-3 py-1 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-50 sm:ml-2"
      >
        Ativar plano
      </Link>
    </div>
  );
}
