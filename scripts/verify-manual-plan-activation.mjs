import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const master = read("src/lib/master.functions.ts");
const subscriberPage = read("src/routes/master/assinantes.tsx");
const subscriptionsPage = read("src/routes/master/assinaturas.tsx");
const credits = read("src/lib/credits.functions.ts");
const banner = read("src/components/trial-banner.tsx");
const activation = master.slice(
  master.indexOf("export const activateCompanyPlanManually"),
  master.indexOf("export const setCompanyTrial"),
);

assert.ok(activation.length > 0, "manual activation server function must exist");
assert.match(activation, /await assertSuper\(/, "only a super admin may activate manually");
assert.match(activation, /\.eq\("ativo", true\)/, "only active catalog plans can be assigned");
assert.match(activation, /provider: "manual"/, "manual activation must be marked as manual");
assert.match(activation, /status: "active"/, "manual activation must activate the subscription");
assert.match(
  activation,
  /status_cobranca: "ativo"/,
  "manual activation must update the company status that controls the trial banner",
);
assert.match(
  activation,
  /topup_plan_credits/,
  "manual activation must apply the plan credit allowance",
);
assert.match(
  activation,
  /external_subscription_id[\s\S]*stripe_subscription_id[\s\S]*paddle_subscription_id/,
  "manual activation must detect external subscriptions to prevent duplicate billing",
);
assert.match(
  subscriberPage,
  /Ativar plano manualmente, sem checkout/,
  "the Master subscriber list must expose manual activation",
);
assert.match(
  subscriberPage,
  /O acesso ficará ativo[\s\S]*até você suspender ou cancelar/,
  "the confirmation must explain that access stays active until manual cancellation",
);
assert.match(
  subscriberPage,
  /O aviso de trial será removido/,
  "the admin confirmation must communicate that trial banner behavior",
);
assert.match(
  subscriptionsPage,
  /r\.provider !== "manual"/,
  "manual access must not be counted as recurring checkout revenue",
);
assert.match(
  credits,
  /status_cobranca: comp\.data\?\.status_cobranca/,
  "the status poll must return current billing state",
);
assert.match(
  banner,
  /setInterval\(load, 30_000\)/,
  "trial banner must refresh status while visible",
);
assert.match(
  banner,
  /if \(billingStatus !== "trial"\) return null/,
  "the banner must disappear after activation",
);

console.log("manual plan activation verified");
