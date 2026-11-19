// Item IDs: CATEGORY-PATTERN-COLOR-KUCHU-SIZE, for example SILK-ZRI-MAR-KCH03-63M (with Kuchu) or SILK-ZRI-MAR-63M (without).
// Colour suggestions from a product photo, and grouping of colour variants of one design.
import type { Product } from './types';

export interface PaletteColor {
  name: string;
  code: string;
  hex: string;
}

/** Colours the shop uses. Hosts can type any other colour name; its code is then made from the first letters. */
export const PALETTE: PaletteColor[] = [
  { name: 'Maroon', code: 'MAR', hex: '#800000' },
  { name: 'Red', code: 'RED', hex: '#C62828' },
  { name: 'Rust', code: 'RST', hex: '#B7410E' },
  { name: 'Orange', code: 'ORG', hex: '#FB8C00' },
  { name: 'Peach', code: 'PCH', hex: '#FFAB91' },
  { name: 'Mustard', code: 'MUS', hex: '#D4A017' },
  { name: 'Yellow', code: 'YEL', hex: '#FDD835' },
  { name: 'Gold', code: 'GLD', hex: '#C9A227' },
  { name: 'Parrot Green', code: 'PGR', hex: '#7CB342' },
  { name: 'Green', code: 'GRN', hex: '#2E7D32' },
  { name: 'Teal', code: 'TEL', hex: '#00897B' },
  { name: 'Sky Blue', code: 'SKY', hex: '#4FC3F7' },
  { name: 'Blue', code: 'BLU', hex: '#1E5FB4' },
  { name: 'Navy', code: 'NVY', hex: '#1A237E' },
  { name: 'Purple', code: 'PUR', hex: '#6A1B9A' },
  { name: 'Lavender', code: 'LAV', hex: '#B39DDB' },
  { name: 'Magenta', code: 'MGN', hex: '#AD1457' },
  { name: 'Pink', code: 'PNK', hex: '#EC407A' },
  { name: 'Wine', code: 'WIN', hex: '#5D0F2B' },
  { name: 'Brown', code: 'BRN', hex: '#6D4C41' },
  { name: 'Beige', code: 'BGE', hex: '#D7C4A3' },
  { name: 'Cream', code: 'CRM', hex: '#F5ECD7' },
  { name: 'White', code: 'WHT', hex: '#FAFAFA' },
  { name: 'Silver', code: 'SLV', hex: '#BDBDBD' },
  { name: 'Grey', code: 'GRY', hex: '#757575' },
  { name: 'Black', code: 'BLK', hex: '#212121' },
];

const clean = (value: string | undefined | null, max: number) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);

export const cleanCodePart = (value: string | undefined | null) => clean(value, 8);

/** A short code for a colour name: the palette code when known, otherwise the first three letters. */
export function colorCodeFor(name: string): string {
  const known = PALETTE.find(color => color.name.toLowerCase() === name.trim().toLowerCase());
  return known ? known.code : clean(name, 3);
}

/** Default category code from a category name, for example "Sarees" -> SARE. Hosts usually type SILK, COTN and so on. */
export const categoryCodeFor = (category: string) => clean(category, 4);

export interface ItemCodeParts {
  category: string;
  pattern: string;
  color: string;
  kuchu?: string;
  size: string;
}

/** Builds the item ID. The Kuchu part is left out when there is none. */
export function buildItemCode(parts: ItemCodeParts): string {
  return [clean(parts.category, 6), clean(parts.pattern, 6), clean(parts.color, 4), clean(parts.kuchu, 8), clean(parts.size, 6)]
    .filter(Boolean)
    .join('-');
}

/** The ID must be 3 to 5 parts of letters and digits, separated by dashes. */
export const isValidItemCode = (code: string): boolean => /^[A-Z0-9]{1,8}(-[A-Z0-9]{1,8}){2,4}$/.test(code);

export function itemCodeTaken(code: string, products: Product[], exceptId?: string): boolean {
  return products.some(product => product.id !== exceptId && (product.itemCode || '').toUpperCase() === code.toUpperCase());
}

// ---------------------------------------------------------------------------------------------
// Colour suggestions from a product photo
// ---------------------------------------------------------------------------------------------
const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

function nearestPalette(r: number, g: number, b: number): PaletteColor {
  let best = PALETTE[0];
  let bestDistance = Infinity;
  for (const color of PALETTE) {
    const [pr, pg, pb] = hexToRgb(color.hex);
    // Weighted distance: the eye is more sensitive to green than blue.
    const distance = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

/**
 * Suggests up to `limit` colour names from the pixels of a photo (RGBA bytes). Plain light or grey backgrounds are
 * ignored, and strong colours count for more, so the saree wins over the wall behind it.
 */
export function suggestColors(rgba: ArrayLike<number>, limit = 3): PaletteColor[] {
  const weights = new Map<string, number>();
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    if (rgba[index + 3] < 200) continue;
    const r = rgba[index];
    const g = rgba[index + 1];
    const b = rgba[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (max > 225 && saturation < 0.18) continue; // white or very light background
    if (saturation < 0.08 && max > 120) continue; // grey background
    const color = nearestPalette(r, g, b);
    weights.set(color.code, (weights.get(color.code) || 0) + 1 + saturation * 3);
  }
  return Array.from(weights.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([code]) => PALETTE.find(color => color.code === code) as PaletteColor);
}

// ---------------------------------------------------------------------------------------------
// Variants: products of the same design in different colours are shown as one listing
// ---------------------------------------------------------------------------------------------
export const designKeyFor = (categoryCode: string, patternCode: string): string => {
  const category = clean(categoryCode, 6);
  const pattern = clean(patternCode, 6);
  return category && pattern ? `${category}-${pattern}` : '';
};

export interface VariantGroup {
  key: string;
  variants: Product[];
}

/** Groups products that share a design key. Products without one stay on their own. The order of first appearance is kept. */
export function groupVariants(products: Product[]): VariantGroup[] {
  const groups: VariantGroup[] = [];
  const index = new Map<string, VariantGroup>();
  for (const product of products) {
    const key = product.designKey || '';
    if (!key) {
      groups.push({ key: product.id, variants: [product] });
      continue;
    }
    const existing = index.get(key);
    if (existing) existing.variants.push(product);
    else {
      const group = { key, variants: [product] };
      index.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}
