import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getDatabase } from './db';
import type { Repos } from './repos';
import { createSqliteRepos } from './sqliteRepos';

let operationsInFlight = 0;

/**
 * On web, mirrors whether any storage operation is still running onto the
 * <html> element as data-quizr-busy. Saves are started the moment an action
 * happens but finish a few milliseconds later; end-to-end tests wait for
 * "false" before reloading so they never race a write.
 */
function reflectBusy() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.quizrBusy = operationsInFlight > 0 ? 'true' : 'false';
}

function trackOperations(repos: Repos): Repos {
  return new Proxy(repos, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        operationsInFlight += 1;
        reflectBusy();
        return Promise.resolve(value.apply(target, args)).finally(() => {
          operationsInFlight -= 1;
          reflectBusy();
        });
      };
    },
  });
}

const defaultRepos = trackOperations(
  createSqliteRepos({
    getDb: getDatabase,
    newId: () => Crypto.randomUUID(),
    now: () => Date.now(),
  }),
);
reflectBusy();

const ReposContext = createContext<Repos>(defaultRepos);

/** Tests wrap screens in this to supply in-memory repositories. */
export function ReposProvider({ repos, children }: { repos: Repos; children: ReactNode }) {
  return <ReposContext.Provider value={repos}>{children}</ReposContext.Provider>;
}

export function useRepos(): Repos {
  return useContext(ReposContext);
}

export type Loaded<T> = {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads data with `load`, and again whenever `key` changes or `reload()` is
 * called. A slower earlier load never overwrites a newer one.
 */
export function useLoad<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<{ key: string; data?: T; error?: Error }>({ key: '' });
  const [version, setVersion] = useState(0);
  const loader = useRef(load);

  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loader.current().then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (reason: unknown) => {
        if (cancelled) return;
        setResult({ key, error: reason instanceof Error ? reason : new Error(String(reason)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const current = result.key === key;

  return {
    data: current ? result.data : undefined,
    error: current ? result.error : undefined,
    loading: !current,
    reload,
  };
}

/** Like useLoad, and also reloads each time the screen comes back into focus. */
export function useLoadOnFocus<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const loaded = useLoad(key, load);
  const { reload } = loaded;
  const first = useRef(true);

  useFocusEffect(
    useCallback(() => {
      // The first focus coincides with the initial load.
      if (first.current) first.current = false;
      else reload();
    }, [reload]),
  );

  return loaded;
}
