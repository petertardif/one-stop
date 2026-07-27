# Project: One Stop

We are building the app described in @SPEC.md In additio to this file, read that file for general architectural tasks or to double check the exact database structure, tech-stack, or application architecture. Update this file and @SPEC.md anytime new features are created.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff and no long code snippets. 

Next.js 14 application with App Router, TypeScript, and vanilla CSS.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: vanilla CSS + shadcn/ui components
- **Data**: React Query for API calls
- **Testing**: Jest + React Testing Library
-**Database**: postgresql

## Project Structure
- `/app`: App Router pages, layouts, and route handlers
- `/components`: Reusable UI components (use shadcn/ui by default)
- `/lib`: Utilities, API clients, and shared logic
- `/public`: Static assets (images, fonts)
- `/hooks`: Custom React hooks

## Code Style
- Use **named exports** only
- No `any` types — prefer `unknown` or specific interfaces
- Functional components with TypeScript
- Use `async/await` over `.then()` chains
- Keep components small and focused
- Use `next/image` for images, `next/link` for navigation

## Commands
- `npm run dev`: Start dev server (port 3000)
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint
- `npm run test`: Run unit tests
- `npm run test:e2e`: Run end-to-end tests

## Architecture & Conventions
- Use **Server Components by default**; add `'use client'` only when needed
- API routes in `/app/api` use Next.js route handlers
- All environment variables prefixed with `NEXT_PUBLIC_` for client access
- Form handling with React Hook Form + Zod validation
- **Mobile shell**: below **768px** the sidebar becomes an off-canvas drawer toggled by a Topbar hamburger. Shared open/close state lives in `components/MobileNavContext.tsx` (`useMobileNav()`); the drawer auto-closes on navigation and locks body scroll. All shell drawer behavior is gated by the `@media (max-width: 768px)` block in `globals.css`; phone content collapses use **640px**. Wide tables stay in their `.ledger-table-wrap` horizontal-scroll containers on mobile (no card layout).
- **Tooltips**: never use the native `title` attribute (slow, unstyled). Wrap the trigger in `<Tooltip text="…">` (`components/Tooltip.tsx`) — a portal-positioned, themed bubble with a ~150ms delay that clones its single child (no wrapper element). In files that also import Recharts' `Tooltip`, alias the chart one (`Tooltip as ChartTooltip`).
- **Sticky tables**: across all table pages, the filter/button row (`.ledger-controls` / `.ledger-controls-mobile`) is `position: sticky` under the top bar, and each table lives in a bounded scroll region (`.ledger-table-wrap` = `overflow:auto; max-height: calc(100dvh - 220px)`) so its `thead th` (already `sticky; top:0`) pins vertically while riding along horizontally with the rows. The filter row sits outside the wrapper, so it stays put.
- **Toolbar buttons**: every page's action toolbar is a `.ledger-actions` flex row of plain `<button>`s. Styling is centralized in `globals.css` — the default button is **secondary**: an accent-colored outline with matching accent text + icon (`--accent-hover`, deepening to `--accent` on hover). Add `className="primary"` for the filled accent main action (one per toolbar, e.g. Add / New Debt). There is no danger/ghost toolbar variant — Delete looks like any other secondary button. (`.danger` is only for the confirm-dialog button via `.dialog-actions button.danger`.) Every button gets a **lucide icon + text label** (`<Icon size={14} /> Label`). The Ledger toolbar additionally wraps its buttons in two `.ledger-actions__group` divs inside `.ledger-actions--split` (bulk actions left, primary group right). Ledger Period/Category filters are `.filter-chip` pill dropdowns (icon + `<select>`).
- **Pending UI**: a page-level busy overlay (`components/BusyOverlay.tsx`, mounted once in `Providers`) shows a spinner whenever work is in flight. React Query mutations are picked up automatically via `useIsMutating` — nothing to wire. Components holding their own `saving`/`isSubmitting` flag call `useBusyWhile(flag)`. Save buttons must also swap their label to `Saving…` (or a fitting verb: `Sending…`, `Updating…`) while pending, in addition to being disabled.

## Gotchas
- No backticks inside SQL strings — query text lives in JS template literals, so a backtick (even in a `--` comment) closes the literal and breaks the build.
- NEVER commit `.env` files
- Always validate data from API routes
- The `/app/layout.tsx` wraps the app with `QueryClientProvider`
- Avoid inline styles
