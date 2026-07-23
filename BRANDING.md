# UyVision Branding Guidelines

**Last Updated:** 2026-07-24  
**Version:** 1.0.0

---

## Brand Identity

**Name:** UyVision  
**Tagline:** AI-powered home renovation and room design platform for Uzbekistan  
**Mission:** Empower homeowners and designers to visualize and plan room renovations with AI assistance

---

## Logo & Visual Identity

### Primary Logo
- **File:** `/frontend/public/logo.svg`
- **Dimensions:** 240×80px (3:1 aspect ratio)
- **Usage:** Main branding, headers, hero sections
- **Variants:** Light theme (blue), Dark theme (white)

### Icon Logo
- **File:** `/frontend/public/icon.svg`
- **Dimensions:** 64×64px
- **Usage:** Sidebar, buttons, favicons, app shortcuts
- **Variants:** Light theme (blue), Dark theme (white)

### Vertical Logo
- **File:** `/frontend/public/logo-vertical.svg`
- **Dimensions:** 80×120px (2:3 aspect ratio)
- **Usage:** Stacked layouts, mobile, sidebars
- **Variants:** Light theme (blue), Dark theme (white)

**👉 See [LOGO_GUIDE.md](./LOGO_GUIDE.md) for complete logo documentation**

---

## Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Brand Blue | `#1E40AF` | 30, 64, 175 | Primary logo, CTAs, links |
| Brand Light | `#3B82F6` | 59, 130, 246 | Hover states, accents |
| Brand Tint | `#EEF2FF` | 238, 242, 255 | Backgrounds, tints |

### Neutral Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| White | `#FFFFFF` | 255, 255, 255 | Backgrounds, surfaces |
| Gray 900 | `#1F2937` | 31, 41, 55 | Headlines, primary text |
| Gray 600 | `#4B5563` | 75, 85, 99 | Body text |
| Gray 400 | `#9CA3AF` | 156, 163, 175 | Muted text, borders |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| Success | `#22C55E` | Success messages, confirmations |
| Warning | `#F59E0B` | Warnings, alerts |
| Error | `#EF4444` | Errors, destructive actions |
| Info | `#3B82F6` | Information, tips |

---

## Typography

### Font Family
- **Primary:** Inter (sans-serif)
- **Fallback:** -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Secondary headers, labels |
| Semibold | 600 | Section headers |
| Bold | 700 | Primary headers, CTAs |
| Extra Bold | 800 | Logo text, hero headlines |

### Font Sizes (Responsive)

| Size | Desktop | Mobile | Usage |
|------|---------|--------|-------|
| H1 | 32-48px | 24-32px | Page titles |
| H2 | 24-32px | 20-24px | Section headers |
| H3 | 18-24px | 16-20px | Subsection headers |
| Body | 16px | 14px | Main text |
| Small | 14px | 12px | Captions, labels |
| Tiny | 12px | 11px | Meta information |

---

## Spacing System

Use a **8px base unit** for consistent spacing:

```
xs: 4px (0.5rem)
sm: 8px (1rem)
md: 16px (2rem)
lg: 24px (3rem)
xl: 32px (4rem)
2xl: 48px (6rem)
```

---

## Button Styles

### Primary Button
- **Background:** Brand Blue (#1E40AF)
- **Text:** White
- **Padding:** 12px 24px
- **Border Radius:** 12px
- **Hover:** #1E40AF at 90% opacity
- **Usage:** Main CTAs, form submission

### Secondary Button
- **Background:** Gray 100 (#F3F4F6)
- **Text:** Gray 900 (#1F2937)
- **Padding:** 12px 24px
- **Border Radius:** 12px
- **Hover:** Gray 200 (#E5E7EB)
- **Usage:** Alternative actions

### Ghost Button
- **Background:** Transparent
- **Text:** Brand Blue (#1E40AF)
- **Border:** 1px Brand Blue
- **Padding:** 12px 24px
- **Border Radius:** 12px
- **Hover:** Gray 100 background
- **Usage:** Tertiary actions

---

## Component Guidelines

### Cards
- **Background:** White (#FFFFFF)
- **Border:** 1px Gray 200 (#E5E7EB)
- **Border Radius:** 12px
- **Shadow:** Light (0px 1px 3px rgba(0, 0, 0, 0.1))
- **Padding:** 16-24px

### Input Fields
- **Background:** White (#FFFFFF)
- **Border:** 1px Gray 200 (#E5E7EB)
- **Border Radius:** 12px
- **Focus:** 2px ring Brand Blue (#1E40AF)
- **Padding:** 12px 16px

### Navigation
- **Background:** White (#FFFFFF)
- **Active Link Color:** Brand Blue (#1E40AF)
- **Inactive Link Color:** Gray 600 (#4B5563)
- **Hover:** Gray 100 (#F3F4F6) background

---

## Voice & Tone

### Principles
- **Friendly:** Approachable and welcoming
- **Clear:** Direct and easy to understand
- **Professional:** Trustworthy and competent
- **Empowering:** User-focused and supportive

### Do's
✅ Use simple, everyday language  
✅ Be specific and actionable  
✅ Use active voice  
✅ Show empathy and understanding  
✅ Use positive language  

### Don'ts
❌ Avoid jargon and technical terms  
❌ Don't use negative language  
❌ Avoid passive voice  
❌ Don't be overly casual  
❌ Avoid unclear references  

### Example Copy

**Good:**
> "Start designing your room in 2 minutes"

**Poor:**
> "Initiate the room design workflow instantaneously"

---

## Product Features

### Core Features
1. **Room Design** — 3D room visualization with furniture
2. **Material Selection** — 41+ materials in the Do'kon (store)
3. **AI Builder** — AI-powered design suggestions
4. **Soft Delete** — Non-destructive room management

### Key Differentiators
- **AI-Powered:** Smart suggestions for renovations
- **Uzbek-Localized:** Full Uzbek language support
- **Material Catalog:** 41 premium materials with pricing
- **Visual Planning:** 3D visualization before renovation

---

## Content Strategy

### Messaging Hierarchy

1. **Value Proposition**  
   "Visualize your dream home before renovation"

2. **Key Benefits**  
   - AI-powered design suggestions
   - Real material pricing
   - 3D room visualization
   - Save multiple designs

3. **Supporting Messages**  
   - Easy to use (no design experience needed)
   - Save time and money
   - Professional results

---

## Application Across Channels

### Website
- Use horizontal logo in header
- Apply color palette consistently
- Follow typography guidelines
- Use branded buttons and cards

### Mobile App
- Use icon logo in status bar
- Use vertical logo on login
- Maintain color palette on small screens
- Scale typography responsively

### Email
- Use horizontal logo in header
- Maintain brand colors
- Use branded buttons
- Follow voice and tone guidelines

### Social Media
- Use icon logo as profile picture
- Use brand colors in graphics
- Maintain professional tone
- Share design inspiration

---

## Implementation Checklist

### Frontend Components
- [x] Logo component with theme support
- [x] Color tokens in Tailwind config
- [x] Typography styles
- [x] Button components
- [x] Card components
- [x] Form components
- [ ] Create Storybook for components

### Pages Using Branding
- [x] AppShell (sidebar logo)
- [x] LoginPage (main logo)
- [ ] Landing page (hero section)
- [ ] Projects page (branding)
- [ ] Profile page (branding)

### Documentation
- [x] LOGO_GUIDE.md
- [x] BRANDING.md (this file)
- [ ] Component library documentation
- [ ] Brand asset download guide

---

## Logo Usage Rules

✅ **DO:**
- Use provided SVG files
- Maintain minimum clear space (at least 10% of logo width)
- Scale proportionally
- Use on white or colored backgrounds
- Use dark variant on dark backgrounds

❌ **DON'T:**
- Change colors (use #1E40AF for light, white for dark)
- Rotate or distort
- Add shadows or effects
- Use low-resolution versions
- Use text next to logo with text already included

---

## File Locations

```
frontend/
├── public/
│   ├── favicon.svg               (Light theme browser icon)
│   ├── favicon-dark.svg          (Dark theme browser icon)
│   ├── logo.svg                  (Light theme horizontal)
│   ├── logo-dark.svg             (Dark theme horizontal)
│   ├── logo-vertical.svg         (Light theme vertical)
│   ├── logo-vertical-dark.svg    (Dark theme vertical)
│   ├── icon.svg                  (Light theme icon)
│   └── icon-dark.svg             (Dark theme icon)
└── src/
    └── components/
        └── branding/
            └── Logo.tsx          (Reusable Logo component)
```

---

## Brand Assets

All brand assets are proprietary to UyVision. Use only within the UyVision project.

For external use, contact the design team.

---

## Updates & Changelog

### Version 1.0.0 (2026-07-24)
- Created complete logo suite (8 files)
- Established color palette
- Defined typography system
- Created reusable Logo component
- Integrated logos into key pages
- Created dark mode variants

---

## Contact

For branding questions or asset requests, contact the UyVision team.

**Email:** rimefara22@gmail.com

---

**UyVision © 2026 — All Rights Reserved**
