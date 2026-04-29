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

interface AppStore {
  cycles: CycleEntry[];
  syncedAt: string | null;
  addCycle: (entry: Omit<CycleEntry, 'id'>) => void;
  deleteCycle: (id: string) => void;
  setSyncedAt: (ts: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'heloc-app-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
