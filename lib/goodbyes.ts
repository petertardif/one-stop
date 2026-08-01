import { z } from 'zod'

// Goodbye messages are co-authored by the admin + any partner_admin. Shared by the
// message route handlers (non-handler exports can't live in a route.ts file, or
// `next build` rejects the route).
export function isAuthor(role?: string): boolean {
  return role === 'admin' || role === 'partner_admin'
}

const imageSchema = z.object({
  image_url: z.string().min(1),
  caption: z.string().nullable().optional(),
})

export const messageSchema = z
  .object({
    kind: z.enum(['main', 'letter', 'video', 'audio', 'gallery', 'open_when']),
    audience_role: z.enum(['everyone', 'partner', 'dependent', 'partner_admin']).nullable().optional(),
    audience_user_id: z.string().uuid().nullable().optional(),
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    media_url: z.string().nullable().optional(),
    release_mode: z.enum(['immediate', 'offset', 'date', 'milestone', 'recurring_annual']),
    offset_amount: z.number().int().positive().nullable().optional(),
    offset_unit: z.enum(['days', 'months', 'years']).nullable().optional(),
    release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    milestone_label: z.string().nullable().optional(),
    images: z.array(imageSchema).optional(),
  })
  .refine((d) => (d.audience_role ? 1 : 0) + (d.audience_user_id ? 1 : 0) === 1, {
    message: 'Provide exactly one of audience_role or audience_user_id',
  })
