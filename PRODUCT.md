# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Indian small-business owners and cashiers who need to create invoices quickly at a counter or on a phone. Accountants and business owners review sales and GST information.

## Product Purpose

Bill Blue helps a business create, share, print, and track GST-ready invoices. It is evolving into a practical retail point-of-sale workflow with products, customers, payments, and stock-aware sales.

## Positioning

An offline-capable, installable billing workspace that keeps the speed of a mobile invoice app while producing professional GST documents.

## Operating Context

The product is used during busy sales, often on a phone, with intermittent connectivity. A sale must be readable and editable without horizontal scrolling; invoices must still export cleanly to A4.

## Capabilities and Constraints

- Vanilla HTML, CSS, and JavaScript with Firebase or local-storage sandbox data.
- Installable PWA for Android and iOS browsers; it is not a native App Store or Play Store application.
- Existing invoice, customer, product, tax, UPI QR, sharing, and print flows must remain functional.

## Brand Commitments

Bill Blue is a calm, credible Indian business tool. It should feel fast, precise, and approachable rather than decorative.

## Evidence on Hand

- Existing implementation: `index.html`, `style.css`, and `script.js`.
- Existing brand mark: `assets/logo.svg`.

## Product Principles

- Make the next sale the obvious action.
- Keep important numbers and payment state unmistakable.
- Use touch-friendly controls and preserve offline resilience.
- Separate mobile editing from A4 document output without sacrificing either.

## Accessibility & Inclusion

- Support keyboard access, visible focus, screen readers, zoom, and reduced motion.
- Maintain touch targets of at least 44px and readable 16px mobile inputs.
