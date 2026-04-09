# Project: One Stop

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

## Gotchas
- NEVER commit `.env` files
- Always validate data from API routes
- The `/app/layout.tsx` wraps the app with `QueryClientProvider`
- Avoid inline styles
