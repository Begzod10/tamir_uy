# UyVision Logo Guide

## Overview

The UyVision logo suite combines a stylized house (representing "Uy" = home in Uzbek) with design/vision rays to symbolize AI-powered room design and renovation planning.

**Brand Color:** `#1E40AF` (Blue)

---

## Logo Files

### 1. **favicon.svg** (Browser Tab Icon)
- **Size:** 128×128px (scales to any size)
- **Usage:** Browser tab, bookmarks, favicons
- **Design:** House with vision rays on blue background
- **Location:** `/frontend/public/favicon.svg`

### 2. **logo.svg** (Horizontal Logo)
- **Size:** 240×80px (aspect ratio 3:1)
- **Usage:** Headers, navigation bars, hero sections
- **Design:** House icon + "UyVision" text horizontally aligned
- **Location:** `/frontend/public/logo.svg`

### 3. **logo-vertical.svg** (Vertical Logo)
- **Size:** 80×120px (aspect ratio 2:3)
- **Usage:** Sidebars, mobile layouts, stacked sections
- **Design:** House icon + "UyVision" text stacked vertically
- **Location:** `/frontend/public/logo-vertical.svg`

### 4. **icon.svg** (Icon Only)
- **Size:** 64×64px
- **Usage:** UI buttons, menu icons, app shortcuts
- **Design:** House shape with vision rays, no text
- **Location:** `/frontend/public/icon.svg`

---

## Design Principles

### Symbolism
- **House Shape:** Represents home, renovation, interior design
- **Vision Rays:** Represent design planning, visualization, AI-powered insights
- **Minimalist Style:** Clean lines, professional appearance
- **Blue Color:** Trust, creativity, technology

### Usage Guidelines

✅ **DO:**
- Use full logo on light backgrounds
- Use icon-only for small sizes (< 48px)
- Maintain white space around logos
- Scale proportionally (never distort)
- Use on both light and dark backgrounds with appropriate contrast

❌ **DON'T:**
- Change the blue color (use `#1E40AF`)
- Rotate or skew the logo
- Add shadows or effects not in original design
- Use text alongside the logo if text is already included
- Compress logo quality excessively

---

## Current Implementation

### Frontend Usage
- **Browser Tab:** `favicon.svg` referenced in `frontend/index.html`
- **Sidebar Logo:** Currently shows emoji 🏠 in `AppShell.tsx` (can be upgraded to icon.svg)
- **Branding:** Can be integrated into headers, landing pages, and marketing materials

### Recommended Upgrades
1. Replace emoji in AppShell.tsx with `<img src="/icon.svg" />`
2. Add logo to landing page hero section
3. Use in email marketing and social media
4. Create variants for dark mode (white stroke on dark background)

---

## Format Details

All logos are **SVG** (Scalable Vector Graphics):
- Resolution-independent
- Smaller file size than PNG/JPG
- Easy to customize colors in code
- Support transparency

---

## Integration Examples

### React Component
```tsx
import { Image } from 'react-dom'

function LogoHorizontal() {
  return <img src="/logo.svg" alt="UyVision" width={240} height={80} />
}

function LogoIcon() {
  return <img src="/icon.svg" alt="UyVision" width={48} height={48} />
}
```

### HTML
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<img src="/logo.svg" alt="UyVision" />
```

### CSS
```css
.logo {
  background-image: url('/icon.svg');
  width: 48px;
  height: 48px;
}
```

---

## Colors

| Element | Color | Hex | RGB |
|---------|-------|-----|-----|
| Primary | Blue | `#1E40AF` | `30, 64, 175` |
| Accent | Light Blue | `#3B82F6` | `59, 130, 246` |
| Background | White | `#FFFFFF` | `255, 255, 255` |
| Text | Dark Gray | `#1F2937` | `31, 41, 55` |

---

## Dark Mode Variant

For dark backgrounds, use white logos (stroke-only):
```svg
<path stroke="white" ... />
```

---

## License

All UyVision logos are proprietary assets. Use only within the UyVision project.

**Created:** 2026-07-24  
**Brand:** UyVision - AI-powered home renovation and design platform
