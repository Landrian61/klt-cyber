# Sacred Curator — Component Pattern Reference

## Buttons

### Primary (Gold Leaf CTA)
```typescript
// LinearGradient background: ['#785600', '#986d00'] at 135deg
// Text: white, Inter, textMd (16px), weight 600
// Height: 52, borderRadius: Radius.md (8)
// Full width by default
// Pressed: gradient darkens, scale(0.98) via Reanimated (100ms)
// Disabled: surfaceHigh bg, outline text color
// Loading: 20px white spinner replaces label, button disabled
```

### Secondary (Ghost)
```typescript
// Background: transparent
// Border: 1px solid rgba(120, 86, 0, 0.20)
// Text: Colors.primary, textMd, weight 600
// Height: 52, borderRadius: Radius.md
// Pressed: primaryLight background
```

### Destructive
```typescript
// Background: Colors.secondaryLight
// Border: 1px solid rgba(171, 51, 50, 0.20)
// Text: Colors.secondary
// Height: 52, borderRadius: Radius.md
```

### Text Link
```typescript
// No background, no border
// Text: Colors.primary, textBase, weight 500
// textDecorationLine: 'underline', textDecorationOffset: 2
```

### Icon Button
```typescript
// Width: 44, Height: 44, minimum touch target
// Icon: 22px centered
// Background: transparent
// Active: primaryLight at 60% opacity
```

---

## Input Fields (Minimalist — bottom border only)

```typescript
// Background: transparent
// Height: 52
// At rest: borderBottomWidth 1, borderBottomColor: 'rgba(140, 132, 112, 0.15)'
// Focus: borderBottomWidth 2, borderBottomColor: Colors.primary
//   — border expands from center (Reanimated, 200ms ease-out)
// Floating label: animates upward when focused/filled (150ms)
//   — Rest: textBase position, onSurfaceVariant color
//   — Active: textSm position (translated up), onSurfaceVariant color
// Value: textBase, onSurface, weight 400
// Helper text: textXs, onSurfaceVariant (below field)
// Error: error color bottom border + error color helper text
// Password: eye icon toggle (22px, outline color), right-aligned
```

---

## Cards

### Editorial Card (standard)
```typescript
// Background: Colors.surfaceLowest (on Colors.surface page)
// Tonal lift defines boundary — NO explicit border
// borderRadius: Radius.lg (12)
// padding: Spacing[4] (16)
```

### Hero Card (Gold)
```typescript
// Background: LinearGradient(['#785600', '#986d00'], 135deg)
// borderRadius: Radius.xl (20)
// padding: Spacing[5] (20)
// All text: white
// Ambient shadow (shadowOpacity: 0.04, shadowRadius: 32)
```

### Sunken Card (active state)
```typescript
// Background: Colors.primaryFixedDim (#F5E6C8)
// No border
// borderRadius: Radius.lg (12)
```

### Priority Card (announcements)
```typescript
// Background: Colors.surfaceLowest
// Left accent: borderLeftWidth 3, borderLeftColor: Colors.primaryBrand
// borderRadius: { topRight: Radius.lg, bottomRight: Radius.lg } (flat left)
```

---

## Badges & Pills
```typescript
// Height: 22, paddingHorizontal: 10, paddingVertical: 2
// borderRadius: Radius.full (9999)
// Font: Inter, textXs (11px), weight 600
// NO border — tonal background only
// See color-tokens.md for badge color matrix
```

---

## Segmented Controls
```typescript
// Container: surfaceLow bg, Radius.full, padding: 4, no border
// Active segment: LinearGradient(['#785600', '#986d00']), white text, Radius.full
// Inactive: transparent bg, onSurfaceVariant text
// Height: 40
// Equal width segments
// Active slides between positions (200ms ease-out)
```

---

## Progress Steps Bar
```typescript
// Full width, height: 3, borderRadius: Radius.full
// Segments separated by 3px gaps
// Completed: LinearGradient(['#785600', '#B8860B'], 90deg)
// Incomplete: surfaceHigh color
// Labels below: textXs, outline (incomplete) / primary (active/complete)
```

---

## Bottom Sheet
```typescript
// Background: rgba(252, 249, 242, 0.82) + BlurView(intensity: 20)
// Top corners: borderRadius Radius.xl (20)
// Drag handle: width 36, height 3, outline at 30% opacity, Radius.full, 10px from top
// Ambient shadow: 0 -8px 32px rgba(28, 28, 24, 0.04)
// Overlay behind: rgba(28, 28, 24, 0.45) — tap to dismiss
// Slide up: 200ms cubic-bezier(0.32, 0.72, 0, 1)
// Dismiss: slide down 150ms ease-in
```

---

## Live Indicator
```typescript
// Dot: width 8, height 8, borderRadius 4, Colors.secondary
// Pulse ring: animated 8px → 20px → 8px, Colors.secondary at 30% opacity
// Animation: 4s ease-in-out infinite loop
```

---

## Loading States

### Button Loading
- Label replaced by 20px spinner (white on gold, gold on ghost)
- Button disabled during loading

### Screen Loading (Skeleton)
- Placeholder shapes matching layout
- surfaceLow color with shimmer (opacity 0.4 → 0.7 → 0.4, 1.5s loop)

### Inline Loading
- Thin gold progress bar (Colors.primary) at top of content area

---

## Error States

### Field Error
- Bottom border → Colors.error
- Helper text → Colors.error
- No fill change

### Network Error Toast
- surfaceLowest bg, 3px left accent Colors.error
- textSm, onSurface text
- Auto-dismiss 5s
- "Retry" gold text link if applicable

### Full Screen Error
- Exclamation icon 40px outline color
- "Something went wrong" Playfair Display textXl
- Description text
- Gold CTA "Try again"
- Centered layout

---

## Empty States

Every empty list/data area must have:
1. Icon 40px, Colors.outline
2. Primary message: Inter, textMd, weight 600, onSurfaceVariant
3. Secondary message: textSm, outline
4. Action button if applicable (gold CTA or gold text link)
