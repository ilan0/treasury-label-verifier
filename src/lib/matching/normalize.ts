const punctuationPattern = /[^\p{L}\p{N}\s]/gu;
const combiningMarksPattern = /\p{M}/gu;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function canonicalizeText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/[™®©℠]/g, " ")
      .normalize("NFKD")
      .replace(combiningMarksPattern, "")
      .replace(/[‘’‛`´]/g, "'")
      .replace(/&/g, " and ")
      .toLocaleLowerCase("en-US")
      .replace(punctuationPattern, " "),
  );
}

export function characterSimilarity(left: string, right: string): number {
  const a = canonicalizeText(left);
  const b = canonicalizeText(right);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

const classTypeAliases: Readonly<Record<string, string>> = {
  whiskey: "whisky",
  whiskies: "whisky",
  whiskeys: "whisky",
  bourbon: "bourbon whisky",
  "straight bourbon": "straight bourbon whisky",
  alc: "alcohol",
  vol: "volume",
};

export function canonicalizeClassType(value: string): string {
  const canonical = canonicalizeText(value);
  const wholeValueAlias = classTypeAliases[canonical];
  if (wholeValueAlias) return wholeValueAlias;

  return canonical
    .split(" ")
    .map((token) => classTypeAliases[token] ?? token)
    .join(" ");
}

const countryAliases: Readonly<Record<string, string>> = {
  usa: "united states",
  "u s a": "united states",
  us: "united states",
  "u s": "united states",
  uk: "united kingdom",
  "u k": "united kingdom",
};

export function canonicalizeCountry(value: string): string {
  const canonical = canonicalizeText(value);
  return countryAliases[canonical] ?? canonical;
}

const stateAliases: Readonly<Record<string, string>> = {
  al: "alabama",
  ak: "alaska",
  az: "arizona",
  ar: "arkansas",
  ca: "california",
  co: "colorado",
  ct: "connecticut",
  de: "delaware",
  fl: "florida",
  ga: "georgia",
  hi: "hawaii",
  id: "idaho",
  il: "illinois",
  in: "indiana",
  ia: "iowa",
  ks: "kansas",
  ky: "kentucky",
  la: "louisiana",
  me: "maine",
  md: "maryland",
  ma: "massachusetts",
  mi: "michigan",
  mn: "minnesota",
  ms: "mississippi",
  mo: "missouri",
  mt: "montana",
  ne: "nebraska",
  nv: "nevada",
  nh: "new hampshire",
  nj: "new jersey",
  nm: "new mexico",
  ny: "new york",
  nc: "north carolina",
  nd: "north dakota",
  oh: "ohio",
  ok: "oklahoma",
  or: "oregon",
  pa: "pennsylvania",
  ri: "rhode island",
  sc: "south carolina",
  sd: "south dakota",
  tn: "tennessee",
  tx: "texas",
  ut: "utah",
  vt: "vermont",
  va: "virginia",
  wa: "washington",
  wv: "west virginia",
  wi: "wisconsin",
  wy: "wyoming",
  dc: "district of columbia",
};

export function canonicalizeAddress(value: string): string {
  return canonicalizeText(value)
    .split(" ")
    .map((token) => stateAliases[token] ?? token)
    .join(" ");
}

export function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(canonicalizeText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(
    canonicalizeText(right).split(" ").filter(Boolean),
  );

  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}
