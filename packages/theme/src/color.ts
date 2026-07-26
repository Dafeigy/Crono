interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation / 100);
  const l = clamp(lightness / 100);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));

  let rgb: [number, number, number];
  if (section < 1) rgb = [chroma, x, 0];
  else if (section < 2) rgb = [x, chroma, 0];
  else if (section < 3) rgb = [0, chroma, x];
  else if (section < 4) rgb = [0, x, chroma];
  else if (section < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  const match = l - chroma / 2;
  return {
    r: Math.round((rgb[0] + match) * 255),
    g: Math.round((rgb[1] + match) * 255),
    b: Math.round((rgb[2] + match) * 255),
  };
}

export function parseCssColor(color: string): Rgb | null {
  const normalized = color.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) {
    return {
      r: Number.parseInt(hex[1].slice(0, 2), 16),
      g: Number.parseInt(hex[1].slice(2, 4), 16),
      b: Number.parseInt(hex[1].slice(4, 6), 16),
    };
  }

  const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHex?.[1]) {
    return {
      r: Number.parseInt(shortHex[1][0]!.repeat(2), 16),
      g: Number.parseInt(shortHex[1][1]!.repeat(2), 16),
      b: Number.parseInt(shortHex[1][2]!.repeat(2), 16),
    };
  }

  const hsl = normalized.match(
    /^hsl\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/,
  );
  if (hsl) {
    return hslToRgb(
      Number(hsl[1]),
      Number(hsl[2]),
      Number(hsl[3]),
    );
  }

  const rgb = normalized.match(
    /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/,
  );
  if (rgb) {
    return {
      r: clamp(Number(rgb[1]), 0, 255),
      g: clamp(Number(rgb[2]), 0, 255),
      b: clamp(Number(rgb[3]), 0, 255),
    };
  }

  return null;
}

const channelToHex = (channel: number) =>
  Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0");

export function mixColors(
  foreground: string,
  background: string,
  foregroundWeight: number,
): string {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return foreground;

  const weight = clamp(foregroundWeight);
  return `#${channelToHex(fg.r * weight + bg.r * (1 - weight))}${channelToHex(
    fg.g * weight + bg.g * (1 - weight),
  )}${channelToHex(fg.b * weight + bg.b * (1 - weight))}`;
}

function luminance(color: Rgb): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * linearize(color.r) +
    0.7152 * linearize(color.g) +
    0.0722 * linearize(color.b)
  );
}

export function contrastRatio(
  foreground: string,
  background: string,
): number | null {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return null;
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

export function bestForeground(background: string): "#ffffff" | "#000000" {
  const white = contrastRatio("#ffffff", background) ?? 0;
  const black = contrastRatio("#000000", background) ?? 0;
  return white >= black ? "#ffffff" : "#000000";
}

