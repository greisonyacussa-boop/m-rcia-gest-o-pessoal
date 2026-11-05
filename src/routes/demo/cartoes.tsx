import { createFileRoute, redirect } from "@tanstack/react-router";

// Mantém links antigos válidos após a criação da área demo de cartão.
export const Route = createFileRoute("/demo/cartoes")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/cartao", replace: true });
  },
});
