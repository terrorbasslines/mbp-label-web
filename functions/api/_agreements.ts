import { id, optionalString, sha256Hex } from "./_shared";

export const CALENDAR_BRANDS = ["MBP", "MBH", "S7"] as const;
export type CalendarBrand = (typeof CALENDAR_BRANDS)[number];

export const SLOT_STATUSES = ["available", "reserved", "confirmed", "locked", "released", "cancelled"] as const;
export type CalendarSlotStatus = (typeof SLOT_STATUSES)[number];

export const AGREEMENT_STATUSES = [
  "draft",
  "waiting_artist_details",
  "artist_review",
  "artist_signed",
  "waiting_label_signature",
  "completed",
  "cancelled",
  "expired",
  "amended"
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const CHECKLIST_ITEMS = [
  { key: "master_control", label: "I own or control the master recording and have authority to license it." },
  { key: "collaborator_credits", label: "All collaborators, vocalists, producers and contributors are correctly credited." },
  { key: "third_party_clearance", label: "Samples, loops, beats, vocals and third-party material are cleared or not used." },
  { key: "ai_media", label: "No unauthorized AI impersonation or misleading synthetic media is included." },
  { key: "lyrics_explicit", label: "Lyrics, explicit content and metadata information are accurate." },
  { key: "delivery_complete", label: "Delivered files, artwork and metadata are complete and accurate." }
] as const;

export type AgreementRow = {
  id: string;
  demo_submission_id: string;
  calendar_slot_id: string;
  brand: string;
  status: string;
  template_version: string;
  current_version_id: string | null;
  release_title: string;
  artist_name: string;
  artist_email: string;
  planned_release_date: string;
  genre: string | null;
  label_share: number;
  artist_pool_share: number;
  distributor: string;
  created_at: string;
  updated_at: string;
};

export type AgreementPartyRow = {
  id: string;
  agreement_id: string;
  role: string;
  name: string;
  legal_name: string | null;
  email: string;
  payment_email: string | null;
  splitshare_email: string | null;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  signature_status: string;
};

export type AgreementSplitRow = {
  id: string;
  agreement_id: string;
  payee_name: string;
  role: string;
  email: string | null;
  share_of_artist_pool: number;
  direct_split_percentage: number;
  is_bonus: number;
};

export type ChecklistRow = {
  id: string;
  agreement_id: string;
  item_key: string;
  label: string;
  status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
};

export type AgreementVersionRow = {
  id: string;
  agreement_id: string;
  version_number: number;
  snapshot_html: string;
  snapshot_hash: string;
  created_by_email: string | null;
  created_by_role: string | null;
  created_at: string;
};

export type AgreementSignatureRow = {
  id: string;
  agreement_id: string;
  agreement_version_id: string;
  party_id: string | null;
  signer_name: string;
  signer_email: string;
  signature_type: string;
  signature_text: string;
  signature_image_key: string | null;
  signature_image_data_url?: string | null;
  signed_at: string;
  document_hash_at_signing: string;
};

export function normalizeBrand(value: unknown): CalendarBrand {
  const normalized = String(value ?? "").trim().toUpperCase();
  return CALENDAR_BRANDS.includes(normalized as CalendarBrand) ? (normalized as CalendarBrand) : "MBP";
}

export function normalizeSlotStatus(value: unknown): CalendarSlotStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SLOT_STATUSES.includes(normalized as CalendarSlotStatus) ? (normalized as CalendarSlotStatus) : "available";
}

export function normalizeAgreementStatus(value: unknown): AgreementStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return AGREEMENT_STATUSES.includes(normalized as AgreementStatus) ? (normalized as AgreementStatus) : "waiting_artist_details";
}

export function toDateString(value: unknown) {
  const text = optionalString(value, 40);
  if (!text) return null;
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarDeadlines(releaseDate: string) {
  return {
    agreement_deadline: addDays(releaseDate, -35),
    asset_deadline: addDays(releaseDate, -28),
    distributor_delivery_deadline: addDays(releaseDate, -21),
    promo_start_date: addDays(releaseDate, -14)
  };
}

export function directSplitFromPool(shareOfArtistPool: number, artistPoolShare = 70) {
  return Math.round(((shareOfArtistPool * artistPoolShare) / 100) * 10000) / 10000;
}

export type ParsedSplit = {
  payee_name: string;
  role: string;
  email: string | null;
  share_of_artist_pool: number;
  direct_split_percentage: number;
};

export function parseSplitsText(input: unknown, fallbackName: string, fallbackEmail: string, artistPoolShare = 70): ParsedSplit[] {
  const text = optionalString(input, 12000);
  if (!text) {
    return [
      {
        payee_name: fallbackName,
        role: "artist",
        email: fallbackEmail,
        share_of_artist_pool: 100,
        direct_split_percentage: directSplitFromPool(100, artistPoolShare)
      }
    ];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes("|") ? line.split("|") : line.split(",");
      const [name, role, email, share] = parts.map((part) => part.trim());
      const poolShare = Number(share);
      return {
        payee_name: name || fallbackName,
        role: role || "artist",
        email: email || null,
        share_of_artist_pool: Number.isFinite(poolShare) ? poolShare : 0,
        direct_split_percentage: directSplitFromPool(Number.isFinite(poolShare) ? poolShare : 0, artistPoolShare)
      };
    });
}

export function validateArtistPoolSplits(rows: Array<{ share_of_artist_pool: number }>) {
  const total = rows.reduce((sum, row) => sum + Number(row.share_of_artist_pool ?? 0), 0);
  return {
    ok: Math.abs(total - 100) < 0.01,
    total: Math.round(total * 100) / 100
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function paragraph(label: string, value: unknown) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "Not provided")}</p>`;
}

function brandContractConfig(brandValue: unknown) {
  const brand = normalizeBrand(brandValue);
  if (brand === "MBH") {
    return {
      brand,
      labelName: "The MasterBeat Horizon",
      subtitle: "The MasterBeat Horizon",
      partyRole: "Principal Label / MBH",
      partyDescription:
        'Stanislav Sidla, as The MasterBeat Horizon ("Label" or "MBH") | Address: Sustekova 3, Bratislava, 851 04, Slovakia | Email: label email on file',
      partiesIntro:
        'The Principal Label / MBH and the Artist are individually a "Party" and collectively the "Parties". Unless expressly stated otherwise, references to the "Label" mean The MasterBeat Horizon / MBH acting through its approved release operator.',
      noticeText:
        "Formal notices under this Agreement must be sent by email to the addresses listed in the Parties section, including the Principal Label / MBH and the Artist, or to any updated email address notified in writing.",
      labelSigner: "Stanislav Sidla / The MasterBeat Horizon",
      operator: null
    };
  }
  if (brand === "S7") {
    return {
      brand,
      labelName: "Section 7",
      subtitle: "Section 7",
      partyRole: "Principal Label / S7",
      partyDescription:
        'Stanislav Sidla, operating as Section 7 ("Label" or "S7") | Address: Sustekova 3, Bratislava, 851 04, Slovakia | Email: label email on file',
      partiesIntro:
        'The Principal Label / S7, the Operator and the Artist are individually a "Party" and collectively the "Parties". Unless expressly stated otherwise, references to the "Label" mean Section 7 / S7 acting through its approved release operator.',
      noticeText:
        "Formal notices under this Agreement must be sent by email to the addresses listed in the Parties section, including the Principal Label / S7, the Operator and the Artist, or to any updated email address notified in writing.",
      labelSigner: "Stanislav Sidla / Section 7",
      operator:
        "Yara-Claire Anderson | Address: Chopinstraat 160D, 1817 GD Alkmaar, Noord-Holland, Netherlands | Email: operator email on file | Role: approved release operator"
    };
  }
  return {
    brand,
    labelName: "The MasterBeat Project",
    subtitle: "The MasterBeat Project",
    partyRole: "Principal Label / MBP",
    partyDescription:
      'Stanislav Sidla, as The MasterBeat Project ("Label" or "MBP") | Address: Sustekova 3, Bratislava, 851 04, Slovakia | Email: label email on file',
    partiesIntro:
      'The Principal Label / MBP and the Artist are individually a "Party" and collectively the "Parties". Unless expressly stated otherwise, references to the "Label" mean The MasterBeat Project / MBP.',
    noticeText:
      "Formal notices under this Agreement must be sent by email to the addresses listed in the Parties section, including the Principal Label / MBP and the Artist, or to any updated email address notified in writing.",
    labelSigner: "Stanislav Sidla / The MasterBeat Project",
    operator: null
  };
}

function formatContractDate(value: unknown) {
  const text = optionalString(value, 40);
  if (!text) return "";
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function contractValue(value: unknown, fallback = "") {
  const text = optionalString(value, 1000);
  return escapeHtml(text ?? fallback);
}

function addressLine(party: AgreementPartyRow) {
  return [party.street_address, party.city, party.state_province, party.postal_code, party.country].filter(Boolean).join(", ");
}

function tableRows(rows: Array<[unknown, unknown]>) {
  return rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${value === "" ? "" : escapeHtml(value || "Not provided")}</td></tr>`)
    .join("");
}

function signatureMarkup(signature?: Partial<AgreementSignatureRow>) {
  if (!signature) return '<span class="contract-signature-line">______________________________</span>';
  if (signature.signature_type === "drawn" && signature.signature_image_data_url) {
    return `<img class="contract-signature-image" src="${escapeHtml(signature.signature_image_data_url)}" alt="Signature by ${escapeHtml(
      signature.signer_name || signature.signer_email || "signer"
    )}" />`;
  }
  return `<span class="contract-typed-signature">${escapeHtml(signature.signature_text || signature.signer_name || "")}</span>`;
}

function latestSignatureFor(signatures: Partial<AgreementSignatureRow>[], role: "artist" | "label" | "operator") {
  if (role === "artist") {
    return signatures.find((signature) => Boolean(signature.party_id)) ?? null;
  }
  if (role === "label") {
    return signatures.find((signature) => !signature.party_id && /masterbeat|section|sidla|admin|label/i.test(String(signature.signer_name || signature.signer_email || ""))) ?? null;
  }
  return signatures.find((signature) => !signature.party_id && /operator|yara|anderson/i.test(String(signature.signer_name || signature.signer_email || ""))) ?? null;
}

export function buildAgreementDocumentHtml(
  agreement: AgreementRow,
  party: AgreementPartyRow,
  splits: AgreementSplitRow[] | ParsedSplit[],
  checklist: ChecklistRow[],
  signatures: Partial<AgreementSignatureRow>[] = []
) {
  const config = brandContractConfig(agreement.brand);
  const artistSignature = latestSignatureFor(signatures, "artist");
  const labelSignature = latestSignatureFor(signatures, "label");
  const operatorSignature = latestSignatureFor(signatures, "operator");
  const effectiveDate = formatContractDate(new Date().toISOString());
  const releaseDate = formatContractDate(agreement.planned_release_date);
  const artistAddress = addressLine(party);
  const splitRows = splits.length
    ? splits
        .map(
          (split) =>
            `<tr><td>${contractValue(split.payee_name)}</td><td>${contractValue(split.role || "Artist")}</td><td>${contractValue(
              split.email
            )}</td><td>${contractValue(split.share_of_artist_pool)}%</td></tr>`
        )
        .join("")
    : `<tr><td>${contractValue(agreement.artist_name)}</td><td>Main Artist / Performer</td><td>${contractValue(agreement.artist_email)}</td><td>100%</td></tr>`;
  const checklistRows = checklist
    .map(
      (item) =>
        `<tr><td>${contractValue(item.label)}</td><td>${item.status === "confirmed" ? "Confirmed by artist" : "Pending confirmation"}${
          item.notes ? ` - ${contractValue(item.notes)}` : ""
        }</td></tr>`
    )
    .join("");

  return `<article class="contract-document" data-contract-brand="${escapeHtml(config.brand)}">
  <header class="contract-cover">
    <h1>EXCLUSIVE MASTER RECORDING LICENCE AGREEMENT</h1>
    <p>${escapeHtml(config.subtitle)}</p>
  </header>

  <section>
    <h2>Agreement Details</h2>
    <table>
      <tbody>
        ${tableRows([
          ["Effective Date", effectiveDate],
          ["Release / Track Title", agreement.release_title],
          ["Main Artist Name", agreement.artist_name],
          ["Version", "Original Mix / Radio Edit / Extended Mix / Remix"],
          ["Catalogue Number", (agreement as AgreementRow & Record<string, unknown>).slot_catalog_number || ""],
          ["Planned Release Date", releaseDate],
          ["Distributor", agreement.distributor],
          ["Template Version", agreement.template_version]
        ])}
      </tbody>
    </table>
  </section>

  <p>This Exclusive Master Recording Licence Agreement (the "Agreement") is entered into on the Effective Date by and between:</p>

  <section>
    <h2>Parties</h2>
    <table>
      <tbody>
        <tr><th>Party / Role</th><th>Details</th></tr>
        <tr><td>${escapeHtml(config.partyRole)}</td><td>${escapeHtml(config.partyDescription)}</td></tr>
        ${config.operator ? `<tr><td>Operator</td><td>${escapeHtml(config.operator)}</td></tr>` : ""}
        <tr><td>Artist</td><td>Artist name: ${contractValue(agreement.artist_name)}<br />Legal name: ${contractValue(
          party.legal_name
        )}<br />Address: ${contractValue(artistAddress)}<br />Country: ${contractValue(party.country)}<br />Email: ${contractValue(
          party.email || agreement.artist_email
        )}<br />Payment email: ${contractValue(party.payment_email)}<br />SplitShare email: ${contractValue(party.splitshare_email)}</td></tr>
      </tbody>
    </table>
  </section>

  <p>${escapeHtml(config.partiesIntro)}</p>
  ${
    config.brand === "S7"
      ? "<p><strong>Operator Authority.</strong> The Operator may assist with release administration, artist communication, metadata collection, marketing coordination, distributor delivery, royalty-split setup and related operational tasks under the authority of the Principal Label / S7. Unless expressly stated in Schedule A or agreed in writing, the Operator does not own the Master and does not replace the Principal Label.</p>"
      : ""
  }

  <section>
    <h3>1. Purpose and Scope</h3>
    <p>This Agreement sets out the terms under which the Artist grants the Label an exclusive licence to distribute, promote and commercially exploit the master sound recording identified in the Agreement Details and Schedule A (the "Master").</p>
    <p>The Agreement is intended for digital music distribution through Symphonic Distribution and digital service providers ("DSPs") such as Spotify, Apple Music, YouTube Music, Amazon Music, Deezer, Beatport, TikTok, Meta, and other current or future platforms made available through the distributor.</p>
    <h3>2. Definitions</h3>
    <p>"Master" means the final sound recording delivered by the Artist and approved for release, including the specific versions listed in Schedule A. A remix, edit, alternate mix, instrumental, acapella, video or derivative version is included only if expressly listed in Schedule A or later approved in writing.</p>
    <p>"Composition" means the underlying musical work, lyrics, melody and songwriting elements embodied in the Master. "Net Receipts" means all revenue actually received and made available for withdrawal from the distributor or DSPs in respect of the Master, after deduction of distributor fees, DSP deductions, taxes withheld at source, payment-processing costs, refunds, chargebacks, currency conversion, fraud penalties and similar third-party deductions.</p>
    <p>"Artist Pool" means the share of Net Receipts allocated to the Artist and any featured artists, producers, remixers or collaborators listed in Schedule B.</p>
    <h3>3. Grant of Rights</h3>
    <p>The Artist grants to the Label, during the Initial Term and throughout the Territory, an exclusive licence to reproduce, distribute, make available, stream, sell, monetize, promote and otherwise exploit the Master through DSPs and other digital platforms. The Label may sub-license these rights to Symphonic Distribution, DSPs, royalty-processing platforms and other service providers solely as necessary to distribute, monetize, promote, protect and administer the Master.</p>
    <p>During the Initial Term, the Artist shall not distribute, license, upload, monetize or authorize any third party to distribute, upload or monetize the Master or a confusingly similar version of the Master through another distributor, label, artist account, YouTube Content ID provider, library or platform without the Label's written approval.</p>
    <p>The Label may use reasonable excerpts of the Master, artwork, artist name, stage name, approved biography and approved promotional materials for release promotion, social media, playlists, advertising, press, pitch decks and catalogue presentation.</p>
    <h3>4. Excluded Rights and Ownership</h3>
    <p>Except for the express licence granted in this Agreement, ownership of the Composition, lyrics, songwriting rights, moral rights and performance rights remains with the Artist and/or the relevant rightsholders. This Agreement does not transfer copyright ownership in the Composition to the Label.</p>
    <p>Any publishing administration, neighbouring rights collection, sync licensing, physical product manufacturing, remix commission or music-video distribution is excluded unless expressly selected in Schedule A or agreed in writing. Nothing in this Agreement limits non-transferable moral rights that cannot be waived or assigned under applicable law.</p>
    <h3>5. Term, Territory and Exclusivity</h3>
    <p>The Term begins on the Effective Date and continues for the Initial Term stated in Schedule A. Unless another period is stated in Schedule A, the Initial Term is three (3) years from the first commercial release date of the Master. The Territory is worldwide.</p>
    <p>After the Initial Term, this Agreement shall continue on a non-exclusive basis for continued distribution, royalty collection, accounting, catalogue administration and takedown processing unless either Party gives written notice of termination or non-renewal at least sixty (60) days before the requested takedown date.</p>
    <h3>6. Label Services</h3>
    <p>The Label will use commercially reasonable efforts to administer the release, submit the Master to the distributor, manage metadata, coordinate release delivery, and make the Master available on relevant DSPs. Marketing services do not guarantee playlist placement, press coverage, streams, revenue, follower growth or platform support.</p>
    <h3>7. Artist Delivery Obligations</h3>
    <p>The Artist shall deliver the final WAV master, artwork, metadata, credits, lyrics if applicable, collaborator details, split information, sample/licence documentation and all other materials reasonably required for release delivery. The Artist is responsible for the accuracy of artist names, legal names, credits, songwriter information, publisher information, ISRC/UPC information, ownership details and collaborator payment details.</p>
    <h3>8. Royalties, Splits and Accounting</h3>
    <p>Unless otherwise stated in Schedule A, Net Receipts will be divided as follows: Artist Pool: seventy percent (70%); Label: thirty percent (30%). The Artist Pool will be divided among the Artist and any featured artists, remixers, producers or collaborators according to Schedule B.</p>
    <p>Statements and payments are dependent on distributor reporting and payment availability. No royalty is payable until the distributor has reported and made the relevant Net Receipts available for withdrawal.</p>
    <h3>9. Costs and Recoupment</h3>
    <p>Recording, mixing, mastering, artwork, video, paid advertising, influencer campaigns and other paid services are included only if expressly agreed in Schedule A or approved in writing, including whether those costs are recoupable. No unapproved cost may be charged against the Artist Pool.</p>
    <h3>10. Warranties and Rights Clearance</h3>
    <p>The Artist represents and warrants that the Artist has full power and authority to enter into this Agreement and grant the rights described here, that the Master does not infringe any third-party rights, and that all samples, loops, vocals, beats, artwork and third-party materials have been cleared or are not used.</p>
    <p>The Artist shall promptly notify the Label of any dispute, copyright claim, sample issue, takedown notice, false credit, metadata correction or platform conflict relating to the Master.</p>
    <h3>11. Takedowns, Corrections and Platform Claims</h3>
    <p>The Label may delay, correct, block, monetize, claim, restrict or take down the Master where reasonably necessary to address rights issues, metadata errors, platform requirements, fraud checks, distributor rules, payment disputes or legal obligations.</p>
    <h3>12. Content ID and Anti-Fraud</h3>
    <p>The Artist must not create conflicting YouTube Content ID claims, duplicate deliveries, artificial streaming activity, misleading metadata or platform behaviour that could place the Label, distributor or DSP accounts at risk.</p>
    <h3>13. Creative Approvals</h3>
    <p>The Label may request reasonable metadata, artwork, audio, title, version, credit or delivery changes required by distributors and DSPs. The Artist will not unreasonably withhold approval of changes needed for delivery, compliance or rights clearance.</p>
    <h3>14. Indemnity and Limitation of Liability</h3>
    <p>The Artist will indemnify the Label against losses, claims, costs and expenses arising from breach of Artist warranties, uncleared rights, false credits, unauthorized samples, ownership disputes, payment disputes or inaccurate information supplied by the Artist. Neither Party is liable for indirect or consequential loss except where prohibited by law.</p>
    <h3>15. Confidentiality and Data</h3>
    <p>Royalty statements, distributor dashboards, marketing plans, unreleased audio, private collaborator information and non-public business terms are confidential and may not be shared publicly without the other Party's consent, except as required by law or professional advisers.</p>
    <p>Each Party will process personal data such as names, addresses, emails, payment details and tax information only as reasonably necessary for contract administration, royalty payment, tax compliance, distributor onboarding and legal compliance.</p>
    <h3>16. Notices</h3>
    <p>${escapeHtml(config.noticeText)} A notice is deemed received when sent, unless the sender receives an automatic delivery failure notice.</p>
    <p>Routine release communication may be handled through email, messaging apps, project-management tools or distributor dashboards, but contract changes must be confirmed in writing by both Parties.</p>
    <h3>17. Governing Law and Jurisdiction</h3>
    <p>This Agreement is governed by the laws of the Slovak Republic, without regard to conflict-of-law rules. The Parties will first attempt to resolve disputes in good faith. If no resolution is reached, the competent courts of the Slovak Republic shall have jurisdiction, unless mandatory law provides otherwise.</p>
    <h3>18. Entire Agreement and Amendments</h3>
    <p>This Agreement, including Schedules A, B and C, constitutes the entire agreement between the Parties concerning the Master and supersedes all prior oral or written discussions about the same subject matter. Any amendment, waiver, additional version, split change, recoupable expense or rights expansion must be made in writing and accepted by both Parties.</p>
    <h3>19. Electronic Signatures</h3>
    <p>This Agreement may be signed electronically, including through Dropbox Sign or any similar electronic-signature platform approved by the Label. Electronic signatures, signature certificates, audit trails and counterpart copies shall have the same legal effect as original signatures, to the fullest extent permitted by law.</p>
  </section>

  <section>
    <h2>Signatures</h2>
    <p>By signing below, the Parties confirm that they have read, understood and agreed to this Agreement and all attached schedules.</p>
    <table>
      <tbody>
        <tr><th>Signing Party</th><th>Signature Block</th></tr>
        <tr><td>Artist</td><td>Artist / Legal Name: ${contractValue(party.legal_name || party.name)}<br />Signature: ${signatureMarkup(
          artistSignature ?? undefined
        )}<br />Signed at: ${contractValue(artistSignature?.signed_at)}</td></tr>
        <tr><td>${escapeHtml(config.partyRole)}</td><td>${escapeHtml(config.labelSigner)}<br />Signature: ${signatureMarkup(
          labelSignature ?? undefined
        )}<br />Signed at: ${contractValue(labelSignature?.signed_at)}</td></tr>
        ${
          config.operator
            ? `<tr><td>Operator</td><td>Yara-Claire Anderson<br />Signature: ${signatureMarkup(operatorSignature ?? undefined)}<br />Signed at: ${contractValue(operatorSignature?.signed_at)}</td></tr>`
            : ""
        }
      </tbody>
    </table>
  </section>

  <section>
    <h2>Schedule A - Commercial and Release Terms</h2>
    <table>
      <tbody>
        ${tableRows([
          ["Master / Track Title", agreement.release_title],
          ["Artist", agreement.artist_name],
          ["Included Versions", "Original Mix / Radio Edit / Extended Mix / Remix as approved for delivery"],
          ["Territory", "Worldwide"],
          ["Initial Term", "Three (3) years from first commercial release date unless otherwise agreed"],
          ["Release Date", releaseDate],
          ["Distributor", agreement.distributor],
          ["Label Share", `${agreement.label_share}% of Net Receipts`],
          ["Artist Pool", `${agreement.artist_pool_share}% of Net Receipts`],
          ["Delivery Deadline", (agreement as AgreementRow & Record<string, unknown>).distributor_delivery_deadline || ""],
          ["Artwork / Asset Deadline", (agreement as AgreementRow & Record<string, unknown>).asset_deadline || ""],
          ["Agreement Deadline", (agreement as AgreementRow & Record<string, unknown>).agreement_deadline || ""]
        ])}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Schedule B - Artist Pool / Collaborator Splits</h2>
    <p>The percentages below divide only the Artist Pool, not the Label share. If the Artist Pool is 70% of Net Receipts and one Artist receives 100% of the Artist Pool, that Artist receives 70% of Net Receipts.</p>
    <p>If the distributor requires direct total-track percentages instead of an Artist Pool structure, the Parties will convert these percentages into equivalent direct SplitShare percentages. For remix releases, unless otherwise agreed in writing, the default direct SplitShare percentages shall be: Label 30%, Original Artist(s) 20%, and Remixer 50%.</p>
    <table>
      <tbody>
        <tr><th>Payee / Contributor</th><th>Role</th><th>Email for SplitShare / Payment</th><th>Share of Artist Pool</th></tr>
        ${splitRows}
        <tr><td>Total</td><td></td><td></td><td>100%</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Schedule C - Delivery and Rights-Clearance Checklist</h2>
    <table>
      <tbody>
        <tr><th>Required Item</th><th>Status / Notes</th></tr>
        ${checklistRows}
      </tbody>
    </table>
    <p>The Label may complete or update the status notes in this Schedule C based on the materials and information provided by the Artist before release delivery. By signing this Agreement, the Artist confirms that all information, credits, rights-clearance details and delivered materials provided to the Label are accurate and complete.</p>
  </section>
</article>`;
}

export async function buildAgreementSnapshot(
  agreement: AgreementRow,
  party: AgreementPartyRow,
  splits: AgreementSplitRow[] | ParsedSplit[],
  checklist: ChecklistRow[]
) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(agreement.release_title)} - ${escapeHtml(agreement.brand)} Release Agreement</title>
</head>
<body>
  ${paragraph("Template version", agreement.template_version)}
  ${buildAgreementDocumentHtml(agreement, party, splits, checklist)}
</body>
</html>`;

  return {
    html,
    hash: await sha256Hex(html)
  };
}

export async function createAgreementVersion(
  db: D1Database,
  agreement: AgreementRow,
  party: AgreementPartyRow,
  splits: AgreementSplitRow[] | ParsedSplit[],
  checklist: ChecklistRow[],
  actorRole: string,
  actorEmail: string | null
) {
  const previous = await db
    .prepare("SELECT MAX(version_number) AS version_number FROM agreement_versions WHERE agreement_id = ?")
    .bind(agreement.id)
    .first<{ version_number: number | null }>();
  const versionNumber = Number(previous?.version_number ?? 0) + 1;
  const snapshot = await buildAgreementSnapshot(agreement, party, splits, checklist);
  const versionId = id("agrver");

  await db
    .prepare(
      `INSERT INTO agreement_versions
       (id, agreement_id, version_number, snapshot_html, snapshot_hash, created_by_email, created_by_role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(versionId, agreement.id, versionNumber, snapshot.html, snapshot.hash, actorEmail, actorRole)
    .run();

  await db
    .prepare("UPDATE release_agreements SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(versionId, agreement.id)
    .run();

  return { id: versionId, version_number: versionNumber, snapshot_hash: snapshot.hash };
}

export async function createAuditEvent(
  db: D1Database,
  request: Request,
  agreementId: string,
  eventType: string,
  actorRole: string,
  actorEmail: string | null,
  data: Record<string, unknown> = {}
) {
  const previous = await db
    .prepare("SELECT event_hash FROM agreement_audit_events WHERE agreement_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1")
    .bind(agreementId)
    .first<{ event_hash: string }>();
  const eventId = id("agrevt");
  const payload = {
    id: eventId,
    agreement_id: agreementId,
    event_type: eventType,
    actor_email: actorEmail,
    actor_role: actorRole,
    data,
    previous_hash: previous?.event_hash ?? null,
    at: new Date().toISOString()
  };
  const eventHash = await sha256Hex(JSON.stringify(payload));

  await db
    .prepare(
      `INSERT INTO agreement_audit_events
       (id, agreement_id, event_type, actor_email, actor_role, event_data_json, ip_address, user_agent, previous_hash, event_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      agreementId,
      eventType,
      actorEmail,
      actorRole,
      JSON.stringify(data),
      request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
      request.headers.get("user-agent"),
      previous?.event_hash ?? null,
      eventHash
    )
    .run();

  return eventHash;
}

export function serializeAgreement(row: AgreementRow & Record<string, unknown>) {
  return {
    ...row,
    label_share: Number(row.label_share ?? 30),
    artist_pool_share: Number(row.artist_pool_share ?? 70)
  };
}
