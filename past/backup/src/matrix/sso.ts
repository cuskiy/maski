import type { LoginFlow, SSOFlow } from "matrix-js-sdk";
import type { SsoTarget } from "../protocol";

function isSsoFlow(flow: LoginFlow): flow is SSOFlow {
  return flow.type === "m.login.sso" || flow.type === "m.login.cas";
}

export function readSsoTargets(flows: readonly LoginFlow[]): SsoTarget[] {
  const targets: SsoTarget[] = [];
  for (const flow of flows) {
    if (!isSsoFlow(flow)) continue;
    const loginType = flow.type === "m.login.cas" ? "cas" : "sso";
    const providers = flow.identity_providers ?? [];
    if (providers.length === 0) {
      targets.push({ loginType, idpId: null, name: "" });
      continue;
    }
    for (const provider of providers) {
      targets.push({ loginType, idpId: provider.id, name: provider.name || provider.id });
    }
  }
  return targets;
}
