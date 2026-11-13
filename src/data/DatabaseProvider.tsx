import { useEffect, useState, type ReactNode } from 'react';

import { prepareDatabase } from './db';

type DatabaseStatus = { state: 'pending' } | { state: 'ready' } | { state: 'error'; error: Error };

type DatabaseProviderProps = {
  children: ReactNode;
  /** Shown while the database opens and migrates. */
  pending: ReactNode;
  /** Shown if the database cannot be opened or migrated. */
  renderError: (error: Error) => ReactNode;
};

/** Renders children only once the database is open and fully migrated. */
export function DatabaseProvider({ children, pending, renderError }: DatabaseProviderProps) {
  const [status, setStatus] = useState<DatabaseStatus>({ state: 'pending' });

  useEffect(() => {
    let cancelled = false;

    prepareDatabase().then(
      () => {
        if (!cancelled) setStatus({ state: 'ready' });
      },
      (reason: unknown) => {
        if (cancelled) return;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        setStatus({ state: 'error', error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (status.state === 'error') return renderError(status.error);
  if (status.state === 'pending') return pending;
  return children;
}
