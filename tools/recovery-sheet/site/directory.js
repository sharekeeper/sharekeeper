/**
 * Public directory boundary. Applications are never a source for this bundle.
 * Only individually reviewed, explicitly approved entries belong in providers.json.
 */
export const SERVICES = Object.freeze([
  "Encrypted-share custody",
  "Identity verification",
  "Recovery coordination",
  "Notarization",
  "Other",
]);

export const PUBLIC_PROVIDER_FIELDS = Object.freeze([
  "id", "status", "businessName", "website", "jurisdiction", "serviceArea",
  "address", "publicEmail", "publicPhone", "services", "description", "reviewedOn",
]);
export const APPLICATION_LIMITS = Object.freeze({
  businessName: 160, website: 500, jurisdiction: 160, serviceArea: 300,
  address: 400, publicEmail: 254, publicPhone: 80, description: 1200,
  contactName: 160, contactEmail: 254, reviewNotes: 2000,
});
const DIRECTORY_LIMITS = Object.freeze({
  ...APPLICATION_LIMITS, id: 100, status: 8, reviewedOn: 10,
});

/**
 * Run at build time, before JSON can be bundled. Rendering an allowlist alone
 * cannot protect private fields accidentally checked into a public source file.
 */
export function assertPublicDirectory(entries) {
  if (!Array.isArray(entries)) throw new Error("Public directory must be an array.");
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Provider ${index}: invalid public directory record.`);
    }
    if (Object.keys(entry).some((key) => !PUBLIC_PROVIDER_FIELDS.includes(key))) {
      throw new Error(`Provider ${index}: non-public field in directory source.`);
    }
    const scalarFields = PUBLIC_PROVIDER_FIELDS.filter((key) => key !== "services");
    if (scalarFields.some((key) => key in entry && typeof entry[key] !== "string")) {
      throw new Error(`Provider ${index}: public scalar fields must contain plain strings, not nested data.`);
    }
    if (scalarFields.some((key) => key in entry && entry[key].length > DIRECTORY_LIMITS[key])) {
      throw new Error(`Provider ${index}: public field exceeds its maximum length; source data must not be shortened silently.`);
    }
    if (entry.status !== "approved") throw new Error(`Provider ${index}: only approved listings may be bundled.`);
    if (!entry.id?.trim() || !entry.businessName?.trim() || !entry.jurisdiction?.trim() || !safeWebsite(entry.website)) {
      throw new Error(`Provider ${index}: missing or invalid required public fields.`);
    }
    if (ids.has(entry.id)) throw new Error(`Provider ${index}: duplicate public listing identifier.`);
    ids.add(entry.id);
    if (!Array.isArray(entry.services) || entry.services.some((service) => !SERVICES.includes(service))) {
      throw new Error(`Provider ${index}: invalid service category.`);
    }
    if (entry.publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.publicEmail)) {
      throw new Error(`Provider ${index}: invalid public email address.`);
    }
    if (entry.reviewedOn && !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn)) {
      throw new Error(`Provider ${index}: invalid listing review date.`);
    }
  }
  return true;
}

const safeText = (value, max = 1000) => typeof value === "string" && value.length <= max ? value.trim() : "";

export function safeWebsite(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

export function approvedProviders(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && entry.status === "approved")
    .map((entry) => ({
      id: safeText(entry.id, 100),
      status: "approved",
      businessName: safeText(entry.businessName, 160),
      website: safeWebsite(entry.website),
      jurisdiction: safeText(entry.jurisdiction, 160),
      serviceArea: safeText(entry.serviceArea, 300),
      address: safeText(entry.address, 400),
      publicEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.publicEmail ?? "") && entry.publicEmail.length <= 254 ? entry.publicEmail : "",
      publicPhone: safeText(entry.publicPhone, 80),
      services: Array.isArray(entry.services)
        ? entry.services.filter((service) => SERVICES.includes(service))
        : [],
      description: safeText(entry.description, 1200),
      reviewedOn: /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn ?? "") ? entry.reviewedOn : "",
    }))
    .filter((entry) => entry.id && entry.businessName && entry.website && entry.jurisdiction);
}

export function filterProviders(entries, { query = "", jurisdiction = "", service = "" } = {}) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const searchable = [
      entry.businessName, entry.jurisdiction, entry.serviceArea,
      entry.description, ...entry.services,
    ].join(" ").toLocaleLowerCase();
    return words.every((word) => searchable.includes(word))
      && (!jurisdiction || entry.jurisdiction === jurisdiction)
      && (!service || entry.services.includes(service));
  });
}

/** An explicitly configured native responder URL, never a guessed endpoint. */
export function hostedFormUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.hostname !== "docs.google.com"
      || !/^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform\/?$/.test(url.pathname)
      || url.username || url.password
    ) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function emptyApplication() {
  return {
    schemaVersion: 1,
    submissionStatus: "not-submitted",
    publicListing: {
      businessName: "", website: "", jurisdiction: "", serviceArea: "",
      address: "", publicEmail: "", publicPhone: "", services: [], description: "",
    },
    privateReview: { contactName: "", contactEmail: "", reviewNotes: "" },
    consent: { publishApprovedPublicFields: false, authorizedRepresentative: false },
  };
}

export function applicationErrors(draft) {
  const errors = {};
  const publicFields = draft.publicListing;
  const privateFields = draft.privateReview;
  for (const key of ["businessName", "jurisdiction", "serviceArea", "description"]) {
    if (!publicFields[key].trim()) errors[key] = "Please complete this field.";
  }
  if (!safeWebsite(publicFields.website)) errors.website = "Enter a complete HTTPS website address.";
  if (!publicFields.services.length) errors.services = "Select at least one proposed service.";
  if (!privateFields.contactName.trim()) errors.contactName = "Enter the reviewer contact’s name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privateFields.contactEmail.trim())) {
    errors.contactEmail = "Enter a valid email for private reviewer contact.";
  }
  if (publicFields.publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicFields.publicEmail.trim())) {
    errors.publicEmail = "Enter a valid public email address, or leave it blank.";
  }
  if (!draft.consent.publishApprovedPublicFields) errors.publishApprovedPublicFields = "Your publishing consent is required.";
  if (!draft.consent.authorizedRepresentative) errors.authorizedRepresentative = "Please confirm your authority to apply.";
  for (const [key, value] of Object.entries({ ...publicFields, ...privateFields })) {
    if (typeof value === "string" && value.length > APPLICATION_LIMITS[key]) {
      errors[key] = `Use ${APPLICATION_LIMITS[key]} characters or fewer. Your input has not been shortened.`;
    }
  }
  return errors;
}
