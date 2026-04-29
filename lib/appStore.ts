// lib/appStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CycleEntry {
  id: string;
  date: string;         // ISO date string for the sweep
  swept: number;        // amount moved to HELOC
  helocBalance: number; // HELOC balance after sweep
  helocLimit: number;   // HELOC credit limit
  interestSaved: number;
}

export type AccountRole = 'mortgage' | 'heloc' | 'checking' | 'savings';

export interface LinkedPlaidAccount {
  id: string;             // Plaid account_id
  name: string;
  institutionName: string;
  mask: string;           // last 4 digits
  type: string;           // depository | loan | line of credit | credit
  subtype: string;        // checking | savings | mortgage | home_equity | …
  balance: number;        // current balance (outstanding for loans)
  available: number | null;
  limit: number | null;
}

interface AppStore {
  // ── cycle tracker ──────────────────────────────────────────────────────────
  cycles: CycleEntry[];
  syncedAt: string | null;
  addCycle: (entry: Omit<CycleEntry, 'id'>) => void;
  deleteCycle: (id: string) => void;
  setSyncedAt: (ts: string) => void;

  // ── plaid accounts ─────────────────────────────────────────────────────────
  plaidAccounts: LinkedPlaidAccount[];
  plaidLinked: boolean;
  accountLabels: Record<string, AccountRole>;
  lastPlaidSync: string | null;
  setPlaidAccounts: (accounts: LinkedPlaidAccount[]) => void;
  setPlaidLinked: (linked: boolean) => void;
  setAccountLabel: (id: string, role: AccountRole) => void;
  removeAccount: (id: string) => void;
  setLastPlaidSync: (ts: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // ── cycle tracker ────────────────────────────────────────────────────
      cycles: [],
      syncedAt: null,

      addCycle: (entry) =>
        set((s) => ({
          cycles: [{ ...entry, id: Date.now().toString() }, ...s.cycles],
          syncedAt: new Date().toISOString(),
        })),

      deleteCycle: (id) =>
        set((s) => ({ cycles: s.cycles.filter((c) => c.id !== id) })),

      setSyncedAt: (ts) => set({ syncedAt: ts }),

      // ── plaid accounts ───────────────────────────────────────────────────
      plaidAccounts: [],
      plaidLinked: false,
      accountLabels: {},
      lastPlaidSync: null,

      setPlaidAccounts: (accounts) =>
        set({ plaidAccounts: accounts, plaidLinked: accounts.length > 0 }),

      setPlaidLinked: (linked) => set({ plaidLinked: linked }),

      setAccountLabel: (id, role) =>
        set((s) => ({ accountLabels: { ...s.accountLabels, [id]: role } })),

      removeAccount: (id) =>
        set((s) => {
          const labels = { ...s.accountLabels };
          delete labels[id];
          return {
            plaidAccounts: s.plaidAccounts.filter((a) => a.id !== id),
            accountLabels: labels,
            plaidLinked: s.plaidAccounts.length > 1,
          };
        }),

      setLastPlaidSync: (ts) => set({ lastPlaidSync: ts }),
    }),
    {
      name: 'heloc-app-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
