export type ModelMode = "u2netp" | "isnet-general-use" | "rmbg-1.4" | "rmbg-2.0";

export type ModelMeta = {
  id: ModelMode;
  name: string;
  file: string;
  size_bytes: number;
  input_size: number;
  mean: number[];
  std: number[];
  license: string;
  source: string;
  download_url: string;
  sha256: string;
  bundled: boolean;
  downloaded: boolean;
};

export const REGISTRY: ModelMeta[] = [
  {
    id: "u2netp",
    name: "Turbo",
    file: "u2netp.onnx",
    size_bytes: 4_574_861,
    input_size: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    license: "Apache-2.0",
    source: "xuebinqin/U-2-Net via rembg",
    download_url: "",
    sha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
    bundled: true,
    downloaded: true,
  },
  {
    id: "isnet-general-use",
    name: "Balanced",
    file: "isnet-general-use.onnx",
    size_bytes: 178_000_000,
    input_size: 1024,
    mean: [0.5, 0.5, 0.5],
    std: [1.0, 1.0, 1.0],
    license: "Apache-2.0",
    source: "xuebinqin/DIS via rembg",
    download_url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    bundled: false,
    downloaded: false,
  },
  {
    id: "rmbg-1.4",
    name: "Balanced+",
    file: "rmbg-1.4.onnx",
    size_bytes: 176_000_000,
    input_size: 1024,
    mean: [0.5, 0.5, 0.5],
    std: [1.0, 1.0, 1.0],
    license: "CC BY-NC 4.0",
    source: "briaai/RMBG-1.4",
    download_url: "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    bundled: false,
    downloaded: false,
  },
  {
    id: "rmbg-2.0",
    name: "Max Quality",
    file: "rmbg-2.0.onnx",
    size_bytes: 173_000_000,
    input_size: 1024,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    license: "CC BY-NC 4.0",
    source: "briaai/RMBG-2.0 via rembg",
    download_url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    bundled: false,
    downloaded: false,
  },
];

export function getModelById(
  id: ModelMode,
  models: ModelMeta[] = REGISTRY,
): ModelMeta | undefined {
  return models.find((m) => m.id === id);
}
