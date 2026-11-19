/** Always a currency amount, e.g. $0.00 */
export const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents ?? 0) / 100);

/** Course price: shows "Free" for 0 */
export const money = (cents: number) => (cents === 0 ? 'Free' : usd(cents));

export const duration = (sec?: number | null) => {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
