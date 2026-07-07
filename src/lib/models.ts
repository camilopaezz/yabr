export type ModelMode = "u2netp" | "isnet-general-use" | "rmbg-1.4" | "rmbg-2.0";

export type ModelMeta = {
  id: ModelMode;
  label: string;
  file: string;
  sizeBytes: number;
  inputSize: number;
  license: string;
  source: string;
  available: boolean;
};

export const MODELS: ModelMeta[] = [
  {
    id: "u2netp",
    label: "Turbo",
    file: "u2netp.onnx",
    sizeBytes: 4_574_861,
    inputSize: 320,
    license: "Apache-2.0",
    source: "xuebinqin/U-2-Net",
    available: true,
  },
  {
    id: "isnet-general-use",
    label: "Balanced",
    file: "isnet-general-use.onnx",
    sizeBytes: 178_000_000,
    inputSize: 1024,
    license: "Apache-2.0",
    source: "xuebinqin/DIS",
    available: false,
  },
  {
    id: "rmbg-1.4",
    label: "Balanced+",
    file: "rmbg-1.4.onnx",
    sizeBytes: 176_000_000,
    inputSize: 1024,
    license: "CC BY-NC 4.0",
    source: "briaai/RMBG-1.4",
    available: false,
  },
  {
    id: "rmbg-2.0",
    label: "Max Quality",
    file: "rmbg-2.0.onnx",
    sizeBytes: 173_000_000,
    inputSize: 1024,
    license: "CC BY-NC 4.0",
    source: "briaai/RMBG-2.0",
    available: false,
  },
];

export function getModelById(id: ModelMode): ModelMeta | undefined {
  return MODELS.find((m) => m.id === id);
}
