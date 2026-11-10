---
version: alpha
name: Blacksmith
description: A high-contrast, industrial SaaS system with neon-acid energy, pixelated hero typography, and disciplined mono utility text.
colors:
  primary: "#F0FB29"
  secondary: "#202020"
  tertiary: "#333333"
  neutral: "#F5F5F5"
  surface: "#FFFFFF"
  on-surface: "#202020"
  background: "#F5F5F5"
  accent: "#F0FB29"
  text: "#333333"
  border: "#E5E7EB"
  info: "#A7E0FF"
  error: "#D92D20"
typography:
  headline-display:
    fontFamily: Arial
    fontSize: 64px
    fontWeight: 700
    lineHeight: 77px
    letterSpacing: 0px
  headline-lg:
    fontFamily: "IBM Plex Sans"
    fontSize: 45px
    fontWeight: 500
    lineHeight: 72px
    letterSpacing: -0.04em
  headline-md:
    fontFamily: "IBM Plex Sans"
    fontSize: 32px
    fontWeight: 500
    lineHeight: 46px
    letterSpacing: -0.025em
  headline-sm:
    fontFamily: "IBM Plex Sans"
    fontSize: 23px
    fontWeight: 500
    lineHeight: 30px
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Arial
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  body-md:
    fontFamily: Arial
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0px
  body-sm:
    fontFamily: Arial
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0px
  label-lg:
    fontFamily: "IBM Plex Mono"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.02em
  label-md:
    fontFamily: "IBM Plex Mono"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.04em
  label-sm:
    fontFamily: "IBM Plex Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.06em
  code-md:
    fontFamily: "IBM Plex Mono"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0em
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 32px
  full: 9999px
spacing:
  xs: 2px
  sm: 16px
  md: 40px
  lg: 48px
  xl: 96px
  gutter: 32px
  section: 96px
components:
  button-primary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "32px"
    size: "171px 82px"
  button-primary-hover:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "32px"
  button-secondary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "32px"
    size: "171px 82px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "0px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.info}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "8px"
---

# Blacksmith

## Overview
Blacksmith feels like a rebellious, performance-first SaaS brand: loud, sharp, and unmistakably engineered. The palette is dominated by an electric yellow field with dark ink typography, creating a playful but serious tone that feels startup-native and highly memorable. The layout is spacious and editorial, but the oversized pixel-style hero and mono utility text give it a technical, almost industrial personality.

## Colors
- **Primary (#F0FB29):** The signature acid-yellow accent and dominant hero background. It powers the brand’s high-energy identity and is also used for callouts, button text on dark fills, and emphasis states.
- **Secondary (#202020):** A deep charcoal ink used for primary text, logos, borders, and filled buttons. It provides the hard contrast that makes the yellow feel even brighter.
- **Tertiary (#333333):** A softer near-black used for body copy and less prominent text where pure charcoal would feel too heavy.
- **Background / Neutral (#F5F5F5):** A very light gray base that supports cards, page framing, and quieter content surfaces without competing with the accent color.
- **Surface (#FFFFFF):** Reserved for clean overlays or content containers when a pure white surface is needed.
- **Border (#E5E7EB):** A subtle cool border tone for cards and separators, keeping structure visible without adding visual noise.
- **Info (#A7E0FF):** A pale sky-blue used for inline highlighting and annotation-style blocks, echoing the screenshot’s light blue code highlight feel.
- **Error (#D92D20):** A reserved semantic red for destructive states; it is not dominant in the screenshot but should remain restrained.

## Typography
The system mixes three distinct voices: Arial for practical readability, IBM Plex Sans for editorial headlines, and IBM Plex Mono for utility and CTA labeling. Headline-display is intentionally bold and blocky, matching the oversized hero wordmark; headline sizes use tighter negative letter spacing to create a compact, engineered feel. Body text stays clean and neutral in Arial, while labels and buttons use IBM Plex Mono with uppercase-style tracking to reinforce the technical, code-adjacent personality.

Use headline-display for brand moments and hero statements, headline-lg through headline-sm for section titles, body-md/body-sm for support copy, and label-md/label-sm for buttons, nav items, and metadata. Code-md is appropriate for inline command-like text, feature bullets, or terminal-inspired snippets. Letter spacing should remain tight on headings and slightly expanded on mono labels for clarity and punch.

## Layout
The page uses a wide, open, fixed-feeling editorial layout with generous breathing room between major zones. Content is anchored with broad horizontal margins and large vertical spacing, while the hero area spans nearly the full viewport to maximize visual impact. Section rhythm is governed by a bold spacing scale: compact 2px details, standard 16px micro spacing, then large leaps at 40px, 48px, and 96px for structural separation.

Cards and overlays should use modest internal padding, while larger feature regions should feel roomy rather than boxed in. Align primary actions and content blocks to a consistent column grid, but allow oversized brand typography to break conventional proportions when needed. The overall density is low; when in doubt, prefer more whitespace over tighter packing.

## Elevation & Depth
The system is mostly flat, relying on contrast, borders, and color blocking instead of layered shadow stacks. When depth is needed, it appears as a sharp offset shadow, especially for popovers or floating panels, rather than soft material-style elevation. Cards use a thin border and quiet background so they remain readable without feeling heavy.

Use shadows sparingly and intentionally; the brand identity is carried more by color and typographic scale than by depth effects. Interactive surfaces should distinguish hover and active states primarily through fill inversion, border emphasis, or subtle offset, not blurred ambient shadow.

## Shapes
The shape language is bold and rounded at the UI level, contrasted with rigid, pixelated typography. Buttons are pill-shaped with full rounding, while cards and containers use modest 8px corners for structure. This pairing creates a strong tension between soft interaction surfaces and hard-edged brand graphics.

Prefer full pills for primary and secondary actions, 8px rounding for cards, and square corners only for raw, code-like elements or text highlights. The overall feel should be friendly and modern, but still engineered and precise.

## Components
Buttons are central to the system and should feel substantial. Use `button-primary` for the main filled action: dark background, yellow text, mono label, wide pill shape, and generous padding. Use `button-secondary` for the outlined/inverted action or alternate emphasis, keeping the same pill geometry and fixed large touch target. Hover states should preserve the brand’s stark contrast; `button-primary-hover` may shift slightly in darkness, but should not become glossy or animated. `button-link` is reserved for nav items, inline utility actions, and text-only controls.

Cards should use the `card` token: light neutral background, 8px radius, 16px padding, and subtle border treatment. Avoid heavy shadows unless the card is floating above the page, such as a cookie or consent panel. Inputs should stay simple and legible, with neutral surfaces, clear borders, and no decorative fill effects. Chips and small tags can use compact rounded pills with a cooler highlight tone, but should remain understated compared with the main CTA system.

Navigation and utility text should use mono or compact sans label styling, often in uppercase or tightly tracked forms. Inline code-like highlights may appear as pale blue blocks with dark text, echoing the screenshot’s terminal-style bullet lines. Any dialog, cookie notice, or system message should feel lightweight and functional, with minimal chrome and strong textual clarity.

## Do's and Don'ts
- Do use the electric yellow as the dominant brand signal and reserve it for the moments that need instant recognition.
- Do keep typography sharp and intentional, with tight headline tracking and mono labels for buttons and utility text.
- Do favor pill buttons and simple bordered cards over ornate, layered UI treatments.
- Do preserve the spacious editorial rhythm; let hero content breathe.
- Don't introduce soft gradients, glossy finishes, or heavily blurred shadows.
- Don't replace the mono utility style with rounded-friendly sans labels in primary CTAs or nav.
- Don't overuse white surfaces; the brand should remain anchored in the yellow/charcoal contrast.
- Don't crowd sections or stack too many elements tightly together; the system relies on openness and scale.