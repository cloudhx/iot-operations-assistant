import { Injectable } from '@nestjs/common';
import { OpaPdpError } from './opa-pdp.error.js';
import type { PendingActionAuthorizationRequest } from './pending-action-authorization-request.js';

@Injectable()
export class OpaPendingActionPolicyClient {
  async evaluate(request: PendingActionAuthorizationRequest): Promise<boolean> {
    // Resolve configuration only when called; startup does not contact OPA.
    const baseUrl = process.env.OPA_URL ?? 'http://127.0.0.1:8181';
    let endpoint: URL;
    try {
      endpoint = new URL(
        `${baseUrl.replace(/\/+$/, '')}/v1/data/authz/pending_actions/allow`,
      );
      if (!['http:', 'https:'].includes(endpoint.protocol)) {
        throw new Error('OPA_URL must use HTTP or HTTPS.');
      }
    } catch (cause) {
      throw new OpaPdpError('Invalid OPA_URL configuration.', { cause });
    }

    const signal = AbortSignal.timeout(5000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: request }),
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new OpaPdpError(`OPA returned HTTP ${response.status}.`);
      }

      const decision: unknown = await response.json();
      if (
        typeof decision !== 'object' ||
        decision === null ||
        !('result' in decision) ||
        typeof decision.result !== 'boolean'
      ) {
        throw new OpaPdpError('OPA response must contain a boolean result.');
      }
      return decision.result;
    } catch (cause) {
      if (cause instanceof OpaPdpError) throw cause;
      throw new OpaPdpError(
        signal.aborted
          ? 'OPA evaluation timed out.'
          : 'OPA evaluation failed during communication or response parsing.',
        { cause },
      );
    }
  }
}
