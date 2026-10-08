/// Whether a confirmation mismatch is worth showing yet.
///
/// Extracted so the rule is stated once and tested, rather than repeated as an
/// inline boolean on the register and reset-password forms, where the two would
/// eventually disagree.
///
/// The subtlety is *when* to complain. Comparing on every keystroke flags a
/// mismatch from the first character of a confirmation nobody has finished
/// typing, so the form shows an error for almost the entire time it is being
/// filled in correctly. Waiting until the confirmation is at least as long as
/// the password means the message appears when it is actually informative.
export function shouldShowMismatch(password: string, confirm: string): boolean {
  if (confirm.length === 0) return false;
  if (password === confirm) return false;
  return confirm.length >= password.length;
}

/// Whether the form may be submitted. Stricter than the message: a half-typed
/// confirmation is not an error worth showing, but it is not submittable either.
export function canSubmitPasswords(password: string, confirm: string): boolean {
  return password.length > 0 && password === confirm;
}
