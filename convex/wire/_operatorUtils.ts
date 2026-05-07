const OPERATOR_SUBJECTS = (process.env.OPERATOR_SUBJECTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isOperatorSubject(subject: string): boolean {
  return OPERATOR_SUBJECTS.length > 0 && OPERATOR_SUBJECTS.includes(subject);
}

export function assertOperatorSubject(subject: string): void {
  if (!isOperatorSubject(subject)) {
    throw new Error("Unauthorized: not an operator subject");
  }
}
