import { useBatchStore, type BatchItem } from "../stores/batchStore";
import { ProgressBar } from "./ProgressBar";

export type BatchListProps = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function statusLabel(item: BatchItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "processing":
      return item.stage ?? "Processing";
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
    default:
      return item.status;
  }
}

export function BatchList({ selectedId, onSelect }: BatchListProps) {
  const items = useBatchStore((state) => state.items);
  const removeItem = useBatchStore((state) => state.removeItem);

  if (items.length === 0) {
    return (
      <p style={{ textAlign: "center", opacity: 0.6 }}>
        No images yet. Drop one above to get started.
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {items.map((item) => (
        <li
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${selectedId === item.id ? "#396cd8" : "rgba(128, 128, 128, 0.3)"}`,
            backgroundColor:
              selectedId === item.id ? "rgba(57, 108, 216, 0.08)" : "transparent",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontSize: "0.9rem",
              }}
              title={item.inputPath}
            >
              {item.inputPath.split(/[\\/]/).pop() ?? item.inputPath}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item.id);
              }}
              style={{
                marginLeft: 8,
                padding: "2px 8px",
                fontSize: "0.75rem",
              }}
            >
              Remove
            </button>
          </div>
          {item.status === "processing" && (
            <ProgressBar stage={item.stage} progress={item.progress} />
          )}
          <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 4 }}>
            {statusLabel(item)}
            {item.error && `: ${item.error}`}
          </div>
        </li>
      ))}
    </ul>
  );
}
