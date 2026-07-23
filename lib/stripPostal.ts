// 住所文字列から郵便番号（〒123-4567 / 123-4567）を除去する
export function stripPostal(addr: string | null | undefined): string {
  if (!addr) return "";
  return addr
    // 〒付きの郵便番号（どこにあっても除去）
    .replace(/〒\s*\d{3}[\-‐−ー－]?\s*\d{4}/g, "")
    // 先頭の裸の郵便番号（3桁-4桁）
    .replace(/^\s*\d{3}[\-‐−ー－]\d{4}\s*/, "")
    .trim();
}
