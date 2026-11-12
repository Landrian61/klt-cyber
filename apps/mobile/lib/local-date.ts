/**
 * `YYYY-MM-DD` and unix ms at church local midnight, the way the profile
 * wizard stores calendar dates (children's birthdays, anniversaries). One
 * copy, so the edit screen and its row sheets cannot drift apart.
 */
export function isoToLocalMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

export function localMsToIso(ms?: number): string | undefined {
  if (ms === undefined) return undefined;
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
