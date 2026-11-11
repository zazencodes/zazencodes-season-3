VERDICT: PASS

## Findings
None.

## Notes
- Reviewed from the diff and by comparing against NewsletterView.vue. I did not run the dev server or take screenshots.
- NotFoundView reuses NewsletterView's wrapper, gradient, logo block, heading and text classes, so it matches the site. It uses only Tailwind utilities and theme colours, with no new CSS.
- Contrast is fine: white heading and gray-300 text on neutral-900/800.
- Taste: the "Back to home" button is white with dark text, which is not the Dracula accent used for other CTAs.
