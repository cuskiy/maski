const policyBase =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https: wss:; worker-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'";

export const metaContentSecurityPolicy = policyBase;

export const contentSecurityPolicy = `${policyBase}; frame-ancestors 'none'`;
