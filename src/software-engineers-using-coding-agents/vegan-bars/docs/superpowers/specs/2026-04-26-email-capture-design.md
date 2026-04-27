# Email Capture Waitlist Band — Design Spec

**Date:** 2026-04-26
**Project:** vegan-bars (`vegan-bars.html`)

## Goal

Add a high-visibility email capture section to the RAWBAR homepage so the owner can gauge purchase intent before the product launches. Collected emails will eventually feed into Mailchimp.

## Placement

A new `<section class="waitlist">` inserted between the hero section and the ticker strip. It is the first thing a visitor sees after scrolling past the hero.

## Visual Design

- **Background:** `--bark` (`#2e2010`) — consistent with product cards, feels like a natural dark shelf
- **Layout:** Two-column on desktop (text left, form right), single-column stacked on mobile (≤900px)
- **Left column:**
  - Eyebrow label: "JOIN THE WAITLIST" — 0.75rem, lime, spaced uppercase
  - Headline: "BE THE FIRST TO KNOW" — Bebas Neue, large (~3–4.5rem clamp), white
  - Body: "Drop your email and we'll tell you the moment Rawbar is ready to ship." — italic, sand color
- **Right column:**
  - Email `<input type="email">` — dark background, cream border, cream placeholder text, full width
  - Submit `<button>` labelled "NOTIFY ME" — lime background, soil-colored text, Bebas Neue, matches `.btn-primary` style
  - Fine print below input: "No spam. Unsubscribe anytime." — 0.8rem, clay color

## Form / Mailchimp Integration

The `<form>` uses `action="YOUR_MAILCHIMP_URL_HERE"` and `method="post"` as a placeholder. When the Mailchimp audience embed URL is available, replace the placeholder value with it. No backend code is required.

## Success State

A small inline JS snippet listens for the form submit event, prevents default, and replaces the form element with a confirmation message: "You're on the list ✦" styled in lime. This provides immediate visual feedback even before Mailchimp is connected.

## Responsive Behavior

- **Desktop (>900px):** Two-column grid, text and form side by side
- **Mobile (≤900px):** Single column, form stacks below text, full-width input and button

## Out of Scope

- Backend email storage or validation
- Double opt-in flow
- Analytics/tracking on form submissions
- Any other page changes
