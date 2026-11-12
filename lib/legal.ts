// Who operates the service — shown in the privacy policy and terms.
// Set in Vercel → Settings → Environment Variables once the legal entity exists.
export const OPERATOR = {
  name: process.env.FL_OPERATOR_NAME || "правообладатель сервиса FinLite KG",
  details: process.env.FL_OPERATOR_DETAILS || "",
  email: process.env.FL_CONTACT_EMAIL || "",
  telegram: process.env.FL_CONTACT_TELEGRAM || "",
};
export const LEGAL_VERSION = "1.0";
export const LEGAL_DATE = "11.11.2026";
