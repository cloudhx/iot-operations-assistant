export const OIDC_FLOW_TTL_SECONDS = 600;

export interface OidcLoginFlow {
  state: string;
  nonce: string;
  verifier: string;
}

export abstract class OidcFlowStore {
  abstract store(
    id: string,
    flow: OidcLoginFlow,
    ttlSeconds: number,
  ): Promise<void>;
  abstract consume(id: string): Promise<OidcLoginFlow | undefined>;
}

export class OidcFlowStoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super('OIDC flow storage is unavailable.', { cause });
  }
}
