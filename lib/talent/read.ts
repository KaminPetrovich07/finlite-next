import { HttpError } from "@/lib/auth/server";
import { clean, cleanList, safeUrl } from "@/lib/community/owner";
import { CONSENT_TEXT, SPECIALIZATIONS } from "./rating";

const year = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 1950 && n <= 2100 ? n : null; };
const ym = (v: unknown) => { const s = clean(v, 7); return /^\d{4}-\d{2}$/.test(s) ? s : ""; };

/** Validate a specialist profile from the client. */
export function readSpecialist(raw: any) {
  const fullName = clean(raw?.fullName, 150), headline = clean(raw?.headline, 200);
  if (fullName.split(/\s+/).length < 2) throw new HttpError(400, "Укажите фамилию и имя");
  if (headline.length < 3) throw new HttpError(400, "Укажите должность или специализацию");
  const workplaces = (Array.isArray(raw?.workplaces) ? raw.workplaces : []).slice(0, 20).map((w: any) => ({
    org: clean(w?.org, 200), position: clean(w?.position, 200), from: ym(w?.from), to: w?.current ? "" : ym(w?.to), current: !!w?.current, duties: clean(w?.duties, 1000),
  })).filter((w: any) => w.org && w.position);
  const education = (Array.isArray(raw?.education) ? raw.education : []).slice(0, 10).map((e: any) => ({ institution: clean(e?.institution, 200), degree: clean(e?.degree, 200), year: year(e?.year) })).filter((e: any) => e.institution);
  const certificates = (Array.isArray(raw?.certificates) ? raw.certificates : []).slice(0, 20).map((c: any) => ({ name: clean(c?.name, 200), issuer: clean(c?.issuer, 200), year: year(c?.year), number: clean(c?.number, 60), url: safeUrl(c?.url) ?? "" })).filter((c: any) => c.name);
  const email = clean(raw?.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Неверный e-mail");
  const exp = Math.round(Number(raw?.experienceYears));
  return {
    fullName, headline,
    city: clean(raw?.city, 100) || null,
    experienceYears: Number.isFinite(exp) ? Math.max(0, Math.min(exp, 60)) : 0,
    specializations: cleanList(raw?.specializations, 10, 60).filter((x) => SPECIALIZATIONS.includes(x)),
    skills: cleanList(raw?.skills, 20, 60),
    workplaces, education, certificates,
    about: clean(raw?.about, 3000) || null,
    availability: ["open", "part", "busy"].includes(raw?.availability) ? raw.availability : "open",
    workFormat: cleanList(raw?.workFormat, 3, 20).filter((x) => ["office", "remote", "outsource"].includes(x)),
    rateFrom: Number(raw?.rateFrom) > 0 ? Math.min(Math.round(Number(raw.rateFrom)), 10_000_000) : null,
    phone: clean(raw?.phone, 40) || null, email: email || null, telegram: clean(raw?.telegram, 60).replace(/^@?/, "@").replace(/^@$/, "") || null,
    published: raw?.published !== false,
  };
}

export function requireConsent(raw: any) {
  if (raw?.consent !== true) throw new HttpError(400, "Без согласия на размещение данных анкету опубликовать нельзя");
  return { consentAt: new Date(), consentText: CONSENT_TEXT };
}
