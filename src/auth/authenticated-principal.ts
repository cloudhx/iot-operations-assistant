/** Provider-neutral identity established by verified authentication. */
export interface AuthenticatedPrincipal {
  id: string;
  email?: string;
  displayName?: string;
}
