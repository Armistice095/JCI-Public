import type { components } from './schema';

export type ApiErrorBody = components['schemas']['Error'] & {
  details?: { fields?: Record<string, string> } & Record<string, unknown>;
};

/** Erreur normalisée de l'API : on se base sur `code` (stable), `message` est déjà en français. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorBody['code'] | 'NETWORK_ERROR' | 'UNKNOWN',
    message: string,
    public fields: Record<string, string> = {},
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isValidation() {
    return this.code === 'VALIDATION_ERROR';
  }
}

export function toApiError(status: number, body: unknown, retryAfterHeader?: string | null): ApiError {
  const b = (body ?? {}) as Partial<ApiErrorBody>;
  const retry = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  return new ApiError(
    status,
    (b.code as ApiError['code']) ?? 'UNKNOWN',
    b.message ?? 'Une erreur est survenue. Réessayez dans un instant.',
    (b.details?.fields as Record<string, string>) ?? {},
    Number.isFinite(retry) ? retry : undefined
  );
}

export const networkError = () =>
  new ApiError(0, 'NETWORK_ERROR', 'Connexion impossible. Vérifiez votre réseau et réessayez.');
