import bcrypt from "bcryptjs";

export const MIN_PASSWORD = 8;

export function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 10);
}

export function checkPassword(p: string, hash: string | null | undefined): Promise<boolean> {
  // Compare against a dummy hash for unknown users so timing does not reveal which emails exist.
  return bcrypt.compare(p, hash ?? "$2a$10$AqivKtzcC3XXcdJjwPhBseXzrA/Ev0zeeKc8GfwQweLf9RIvTGP6W");
}

export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Пароль — не меньше ${MIN_PASSWORD} символов`;
  if (p.length > 200) return "Слишком длинный пароль";
  if (!/[A-Za-zА-Яа-яЁё]/.test(p) || !/\d/.test(p)) return "Пароль должен содержать буквы и цифры";
  return null;
}

/** Readable temporary password for admin resets, e.g. "kemer-4821-tal". */
export function tempPassword(): string {
  const words = ["ala", "too", "kemer", "naryn", "talas", "chui", "osh", "batken", "issyk", "kol", "jalal", "arsl"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${Math.floor(1000 + Math.random() * 9000)}-${pick()}`;
}
