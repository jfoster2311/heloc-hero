// hooks/useCategories.ts — the builtin taxonomy plus whatever the user added.
//
// One instance, mounted in useFinancials and handed down as `f.categories`, for
// the same reason useTransactionMeta is: a screen mounting this again would get
// its own copy, and a category created in one place would not appear in the
// picker in another until a remount.
//
// ── Resolution ─────────────────────────────────────────────────────────────
// `metaFor` is total. Every id resolves to something renderable, including ids
// whose category has been deleted — those fall back to "Other" rather than
// throwing or rendering a blank row. That is a real case, not a defensive
// flourish: deleting a category deliberately leaves the transactions that were
// filed under it alone (see the migration), so orphaned ids are expected and
// the app has to be honest about them rather than crash.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  SPEND_CATEGORIES, categoryMeta,
  type SpendCategory, type CategoryMeta, type CustomCategoryId,
} from '../lib/spending';

export interface UseCategoriesResult {
  /** Builtins first, then the user's own. The order every picker uses. */
  all: CategoryMeta[];
  /** Just the user's, for the manage/delete list. */
  custom: CategoryMeta[];
  /** Total: any id resolves, including deleted ones. */
  metaFor: (id: SpendCategory) => CategoryMeta;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Returns the new id, or null when the write failed. */
  create: (label: string, icon: string) => Promise<CustomCategoryId | null>;
  remove: (id: CustomCategoryId) => Promise<void>;
}

interface Row { id: string; label: string; icon: string }

export function useCategories(userId: string | null | undefined): UseCategoriesResult {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('custom_categories')
        .select('id, label, icon')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (err) {
        // The builtins still work, so the breakdown still renders — it just
        // renders the user's own categories as "Other". Say so rather than
        // showing an empty screen.
        setError("Couldn't load your own categories.");
        setRows([]);
      } else {
        setError(null);
        setRows((data ?? []) as Row[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const custom = useMemo<CategoryMeta[]>(
    () => rows.map(r => ({
      id: `custom:${r.id}` as CustomCategoryId,
      label: r.label,
      icon: r.icon as CategoryMeta['icon'],
      custom: true,
    })),
    [rows],
  );

  const all = useMemo(() => {
    // `other` is pinned last across the whole app, so the user's categories go
    // ahead of it rather than after — a fallback below a real category reads as
    // the list having ended.
    const builtins = SPEND_CATEGORIES.slice(0, -1);
    const other = SPEND_CATEGORIES[SPEND_CATEGORIES.length - 1];
    return [...builtins, ...custom, other];
  }, [custom]);

  const index = useMemo(
    () => new Map(custom.map(c => [c.id, c])),
    [custom],
  );

  const metaFor = useCallback(
    (id: SpendCategory) => index.get(id) ?? categoryMeta(id),
    [index],
  );

  const create = useCallback(async (label: string, icon: string) => {
    if (!userId) return null;
    const trimmed = label.trim();
    if (!trimmed) return null;

    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('custom_categories')
      .insert({ user_id: userId, label: trimmed, icon })
      .select('id, label, icon')
      .single();

    if (!alive.current) return null;
    setSaving(false);
    if (err || !data) {
      // The unique index on (user_id, lower(label)) is the likely failure, and
      // it is worth naming: "couldn't save" would leave the user retrying the
      // same name forever.
      setError(
        err?.code === '23505'
          ? `You already have a category called “${trimmed}”.`
          : "Couldn't create that category. Check your connection and try again.",
      );
      return null;
    }

    const row = data as Row;
    setRows(prev => [...prev, row]);
    return `custom:${row.id}` as CustomCategoryId;
  }, [userId]);

  const remove = useCallback(async (id: CustomCategoryId) => {
    if (!userId) return;
    const rowId = id.slice('custom:'.length);
    const previous = rows;

    setRows(prev => prev.filter(r => r.id !== rowId));
    setSaving(true);
    setError(null);

    const { error: err } = await supabase
      .from('custom_categories')
      .delete()
      .eq('user_id', userId)
      .eq('id', rowId);

    if (!alive.current) return;
    setSaving(false);
    if (err) {
      setRows(previous);
      setError("Couldn't delete that category.");
    }
  }, [userId, rows]);

  return { all, custom, metaFor, loading, saving, error, create, remove };
}
