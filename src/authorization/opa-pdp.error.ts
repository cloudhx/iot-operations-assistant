/** A PDP failure is distinct from a successful policy decision of false. */
export class OpaPdpError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OpaPdpError';
  }
}
