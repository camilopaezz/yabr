import { NC_LICENSE_MODAL_COPY } from "../lib/ncLicense";

export type NcLicenseModalProps = {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
};

export function NcLicenseModal({
  open,
  onAccept,
  onCancel,
}: NcLicenseModalProps) {
  return (
    <div className={`nc-license-modal-backdrop${open ? " is-open" : ""}`}>
      <div
        className={`nc-license-modal-card${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nc-license-modal-title"
      >
        <h3 id="nc-license-modal-title">{NC_LICENSE_MODAL_COPY.title}</h3>
        <p className="nc-license-modal-summary">
          {NC_LICENSE_MODAL_COPY.summary}
        </p>
        <p className="nc-license-modal-hint">
          {NC_LICENSE_MODAL_COPY.commercialHint}
        </p>
        <p className="nc-license-modal-license">
          <a
            href={NC_LICENSE_MODAL_COPY.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {NC_LICENSE_MODAL_COPY.licenseLabel}
          </a>
        </p>
        <div className="nc-license-modal-actions">
          <button type="button" onClick={onCancel}>
            {NC_LICENSE_MODAL_COPY.cancelLabel}
          </button>
          <button type="button" className="btn-primary" onClick={onAccept}>
            {NC_LICENSE_MODAL_COPY.acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
