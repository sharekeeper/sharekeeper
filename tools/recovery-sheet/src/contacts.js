export const FIELD_LIMITS = {
  name: 80,
  address1: 100,
  address2: 100,
  region: 80,
  reference: 60,
  phone: 48,
  website: 120,
};

export function contactErrors(keeper) {
  const errors = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = keeper[field] ?? "";
    if (typeof value !== "string") errors[field] = "Enter text in this field.";
    else if (/[\u0000-\u001f\u007f]/u.test(value)) errors[field] = "Use a single line without control characters.";
    else if ([...value].length > limit) errors[field] = `Use no more than ${limit} characters.`;
  }
  if (!keeper.name?.trim()) errors.name = "Enter the sharekeeper’s name.";
  if (![keeper.phone, keeper.website, keeper.address1].some((v) => v?.trim())) {
    errors.phone = "Add a phone, website, or street address.";
  }
  return errors;
}
