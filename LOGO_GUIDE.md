# UyVision Logo Guide

## Overview

The UyVision logo suite combines a stylized house (representing "Uy" = home in Uzbek) with design/vision rays to symbolize AI-powered room design and renovation planning.

**Brand Color:** `#1E40AF` (Blue)

---

## Logo Files

### Light Theme Logos

#### 1. **favicon.svg** (Browser Tab Icon)
- **Size:** 128×128px (scales to any size)
- **Usage:** Browser tab, bookmarks, favicons
- **Design:** House with vision rays on blue background
- **Location:** `/frontend/public/favicon.svg`

#### 2. **logo.svg** (Horizontal Logo)
- **Size:** 240×80px (aspect ratio 3:1)
- **Usage:** Headers, navigation bars, hero sections
- **Design:** House icon + "UyVision" text horizontally aligned (blue)
- **Location:** `/frontend/public/logo.svg`

#### 3. **logo-vertical.svg** (Vertical Logo)
- **Size:** 80×120px (aspect ratio 2:3)
- **Usage:** Sidebars, mobile layouts, stacked sections
- **Design:** House icon + "UyVision" text stacked vertically (blue)
- **Location:** `/frontend/public/logo-vertical.svg`

#### 4. **icon.svg** (Icon Only)
- **Size:** 64×64px
- **Usage:** UI buttons, menu icons, app shortcuts
- **Design:** House shape with vision rays, no text (blue)
- **Location:** `/frontend/public/icon.svg`

### Dark Theme Logos ✨ (NEW)

#### 5. **favicon-dark.svg** (Dark Theme Browser Tab Icon)
- **Size:** 128×128px (scales to any size)
- **Usage:** Browser tab for dark mode
- **Design:** House with vision rays on dark background
- **Location:** `/frontend/public/favicon-dark.svg`

#### 6. **logo-dark.svg** (Dark Theme Horizontal Logo)
- **Size:** 240×80px (aspect ratio 3:1)
- **Usage:** Headers on dark backgrounds
- **Design:** House icon + "UyVision" text horizontally aligned (white)
- **Location:** `/frontend/public/logo-dark.svg`

#### 7. **logo-vertical-dark.svg** (Dark Theme Vertical Logo)
- **Size:** 80×120px (aspect ratio 2:3)
- **Usage:** Sidebars on dark backgrounds
- **Design:** House icon + "UyVision" text stacked vertically (white)
- **Location:** `/frontend/public/logo-vertical-dark.svg`

#### 8. **icon-dark.svg** (Dark Theme Icon Only)
- **Size:** 64×64px
- **Usage:** UI buttons, menu icons on dark backgrounds
- **Design:** House shape with vision rays (white)
- **Location:** `/frontend/public/icon-dark.svg`

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

## Current Implementation ✅ COMPLETE

### Frontend Usage
- ✅ **Browser Tab:** `favicon.svg` referenced in `frontend/index.html`
- ✅ **Sidebar Logo:** Icon SVG in `AppShell.tsx` line 160
- ✅ **Login Page:** Horizontal logo in `LoginPage.tsx` line 248
- ✅ **Logo Component:** Reusable `Logo.tsx` with theme support

### Completed Integrations (2026-07-24)
1. ✅ Sidebar emoji replaced with `icon.svg`
2. ✅ Login page now uses `logo.svg`
3. ✅ Dark theme variants created (4 files)
4. ✅ Reusable Logo component with theme switching
5. ✅ Documentation updated with examples

### Optional Future Enhancements
1. Add Logo component to landing page hero section
2. Use in email marketing templates
3. Create animated version (SVG animation)
4. Add to social media profiles

---

## Format Details

All logos are **SVG** (Scalable Vector Graphics):
- Resolution-independent
- Smaller file size than PNG/JPG
- Easy to customize colors in code
- Support transparency

---

## Integration Examples

### React Component (Using Logo Component) ⭐ RECOMMENDED

```tsx
import { Logo } from '@/components/branding/Logo'

// Horizontal logo (light theme)
<Logo variant="horizontal" theme="light" />

// Icon only (dark theme)
<Logo variant="icon" theme="dark" width="48px" />

// Vertical logo (auto-detects theme)
<Logo variant="vertical" theme="dark" />

// Custom dimensions
<Logo variant="horizontal" width="300px" height="100px" />
```

### Logo Component Props

```typescript
interface LogoProps {
  variant?: 'horizontal' | 'vertical' | 'icon'    // Default: 'horizontal'
  theme?: 'light' | 'dark'                         // Default: 'light'
  width?: number | string                          // Default: based on variant
  height?: number | string                         // Default: based on variant
  alt?: string                                     // Default: 'UyVision'
  className?: string                               // Optional CSS classes
}
```

### Direct Image Usage (Legacy)

```tsx
import { Image } from 'react-dom'

function LogoHorizontal() {
  return <img src="/logo.svg" alt="UyVision" width={240} height={80} />
}

function LogoIcon() {
  return <img src="/icon.svg" alt="UyVision" width={48} height={48} />
}

// Dark theme variants
function LogoDark() {
  return <img src="/logo-dark.svg" alt="UyVision" width={240} height={80} />
}
```

### HTML
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<img src="/logo.svg" alt="UyVision" />

<!-- Dark mode -->
<link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)" />
```

### CSS
```css
.logo {
  background-image: url('/icon.svg');
  width: 48px;
  height: 48px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .logo {
    background-image: url('/icon-dark.svg');
  }
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
