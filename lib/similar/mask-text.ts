export type MaskTheme = "and" | "want_to";

const MASK = "████";

function getThemePattern(theme: MaskTheme): RegExp {
  switch (theme) {
    case "and":
      return /\band\b/gi;
    case "want_to":
      return /\b(?:want\s+to|wanna)\b/gi;
  }
}

export function maskThemeInText(text: string, theme: MaskTheme): string {
  return text.replace(getThemePattern(theme), MASK);
}
