import { createFileRoute, redirect } from "@tanstack/react-router";

// Mantém favoritos e links antigos funcionando após a criação da aba individual.
export const Route = createFileRoute("/app/cartoes")({
  beforeLoad: () => {
    throw redirect({ to: "/app/cartao", replace: true });
  },
});
