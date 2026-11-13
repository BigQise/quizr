import { count } from 'drizzle-orm';
import { useEffect, useState } from 'react';

import { db } from '@/data/db';
import { sets } from '@/data/schema';

import { HomeView } from './HomeView';

/**
 * Phase 0 placeholder. It reads from SQLite through Drizzle so that the whole
 * storage path (open, migrate, query) is exercised on every platform before
 * any feature depends on it. Phase 1 replaces the inline query with a
 * repository.
 */
export function HomeScreen() {
  const [setCount, setSetCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    db.select({ value: count() })
      .from(sets)
      .then((rows) => {
        if (!cancelled) setSetCount(rows[0]?.value ?? 0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <HomeView setCount={setCount} />;
}
