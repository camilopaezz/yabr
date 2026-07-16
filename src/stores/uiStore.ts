import { create } from "zustand";

type UiState = {
  /** True while NC license or model download modal is open. */
  modalBlocksShortcuts: boolean;
  setModalBlocksShortcuts: (blocked: boolean) => void;
};

export const uiStore = create<UiState>((set) => ({
  modalBlocksShortcuts: false,
  setModalBlocksShortcuts: (blocked) => set({ modalBlocksShortcuts: blocked }),
}));

export const useUiStore = uiStore;
