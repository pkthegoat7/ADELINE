import { create } from 'zustand';

interface UIState {
  cmdkOpen: boolean;
  openCmdk: () => void;
  closeCmdk: () => void;
  toggleCmdk: () => void;

  reservationDrawerId: string | null;
  openReservation: (id: string) => void;
  closeReservation: () => void;
}

export const useUI = create<UIState>((set) => ({
  cmdkOpen: false,
  openCmdk: () => set({ cmdkOpen: true }),
  closeCmdk: () => set({ cmdkOpen: false }),
  toggleCmdk: () => set((s) => ({ cmdkOpen: !s.cmdkOpen })),

  reservationDrawerId: null,
  openReservation: (id) => set({ reservationDrawerId: id }),
  closeReservation: () => set({ reservationDrawerId: null }),
}));
