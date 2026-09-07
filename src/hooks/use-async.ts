import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppError } from '@/types/common';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
}

/**
 * Small data-fetching helper: keeps previous data while refetching so screens
 * don't flash empty, and reports errors as messages the UI can show verbatim.
 */
export function useAsync<T>(factory: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    factoryRef
      .current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState((current) => ({
          data: current.data,
          loading: false,
          error: toAppError(error),
        }));
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export function toAppError(error: unknown): AppError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return error as AppError;
  }
  if (error instanceof Error) {
    return { code: 'unknown', message: error.message };
  }
  return { code: 'unknown', message: 'No pude completar la operación. Probá de nuevo.' };
}
