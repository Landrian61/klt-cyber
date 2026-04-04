# Sacred Curator — Typography Reference

## Font Families

```typescript
const FontFamily = {
  display: 'Merriweather-Bold',   // Hero text, sermon titles, scripture, section titles (>=18px)
  body: 'Inter-Regular',             // All UI text, labels, body copy, forms, navigation
  bodyMedium: 'Inter-Medium',        // Weight 500
  bodySemiBold: 'Inter-SemiBold',    // Weight 600
  bodyBold: 'Inter-Bold',            // Weight 700
  mono: 'JetBrainsMono-Regular',     // Giving amounts, countdowns, reference numbers
  monoBold: 'JetBrainsMono-Bold',    // Weight 700
} as const;
```

## Type Scale

| Token | Size | Line Height | Weight | Font | Usage |
|-------|------|------------|--------|------|-------|
| textXs | 11 | 1.4 (15.4) | 400 | Inter | Timestamps, helper notes |
| textSm | 12 | 1.5 (18) | 400 | Inter | Labels, badge text, captions |
| textBase | 14 | 1.6 (22.4) | 400 | Inter | Body, list items |
| textMd | 16 | 1.5 (24) | 500 | Inter | Card titles, interactive labels |
| textLg | 20 | 1.3 (26) | 600 | Inter | Screen titles in Inter |
| textXl | 24 | 1.2 (28.8) | 700 | Playfair | Hero headings |
| text2xl | 32 | 1.1 (35.2) | 700 | JetBrains Mono | Display amounts |
| textDisplay | 56 | 1.0 | 700 | Playfair | Sparingly, letterSpacing: -0.5 |

## Hierarchy Rules

1. **Headings >18px** → Merriweather (Bold/700)
2. **Everything <=18px** → Inter (appropriate weight)
3. **Amounts & timers** → JetBrains Mono
4. **Hero headings** use asymmetric margins: `paddingLeft: 32, paddingRight: 48`
5. **Section labels** (uppercase): Inter, textXs, weight 600, Colors.outline, letterSpacing: 0.6
6. **Screen titles**: Merriweather, textXl, weight 700, Colors.onSurface

## Anti-Patterns (NEVER do these)

- Merriweather below 18px
- Merriweather for navigation, badges, or form inputs
- Inter for screen hero headings or section display titles
- JetBrains Mono outside amounts, timers, reference numbers
- More than two typefaces on one screen
- Pure black (#000000) for text — always Colors.onSurface (#1C1C18)
