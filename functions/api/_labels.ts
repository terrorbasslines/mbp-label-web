export type LabelKey = "mbp" | "mbh" | "s7";

export type LabelDetails = {
  key: LabelKey;
  name: string;
  shortName: string;
  catalogPrefix: string;
  color: string;
};

export type CatalogCandidate = {
  catalogNumber: string;
  remix: boolean;
};

export const LABEL_DETAILS: Record<LabelKey, LabelDetails> = {
  mbp: {
    key: "mbp",
    name: "The MasterBeat Project",
    shortName: "MBP",
    catalogPrefix: "MBP",
    color: "#bd00ff"
  },
  mbh: {
    key: "mbh",
    name: "The MasterBeat Horizon",
    shortName: "MBH",
    catalogPrefix: "MBH",
    color: "#7eb7ff"
  },
  s7: {
    key: "s7",
    name: "Section 7",
    shortName: "S7",
    catalogPrefix: "S7",
    color: "#e7ff00"
  }
};

export function normalizeLabelKey(value: unknown): LabelKey | "all" {
  const normalized = String(value ?? "mbp").trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "all") return "all";
  if (normalized === "mbh" || normalized === "horizon" || normalized === "themasterbeathorizon") return "mbh";
  if (normalized === "s7" || normalized === "section7" || normalized === "section-7") return "s7";
  return "mbp";
}

export function labelDetails(value: unknown): LabelDetails {
  const key = normalizeLabelKey(value);
  return LABEL_DETAILS[key === "all" ? "mbp" : key];
}

export function labelFromCatalogNumber(catalogNumber: unknown): LabelKey {
  const normalized = String(catalogNumber ?? "").trim().toUpperCase();
  if (/^S7(?:-|_)?\d/.test(normalized)) return "s7";
  if (/^MBH\d/.test(normalized)) return "mbh";
  return "mbp";
}

export function catalogNumberFromIndexForLabel(label: LabelKey, index: number) {
  const padded = String(index).padStart(3, "0");
  if (label === "s7") return `S7-${padded}`;
  return `${LABEL_DETAILS[label].catalogPrefix}${padded}`;
}

export function isRemixCatalogNumber(catalogNumber: unknown) {
  return /(?:-R(?:10|[1-9])?|R)$/i.test(String(catalogNumber ?? "").trim());
}

export function catalogCandidatesForImport(label: LabelKey, index: number): CatalogCandidate[] {
  const base = catalogNumberFromIndexForLabel(label, index);
  const candidates: CatalogCandidate[] = [{ catalogNumber: base, remix: false }];

  candidates.push({ catalogNumber: `${base}R`, remix: true });
  if (label !== "mbp") {
    for (let remixIndex = 1; remixIndex <= 10; remixIndex += 1) {
      candidates.push({ catalogNumber: `${base}-R${remixIndex}`, remix: true });
    }
  }

  return candidates;
}
