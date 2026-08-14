import { z } from "zod";

export const ProfileNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-_]{0,63}$/);

export const ProfileSchema = z.object({
  version: z.literal(1),
  name: ProfileNameSchema,
  mode: z.enum(["storage-state", "persistent"]),
  startUrl: z.url(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  auth: z.object({
    status: z.enum(["unknown", "valid", "expired", "error"]),
    lastLoginAt: z.iso.datetime().nullable(),
    lastVerifiedAt: z.iso.datetime().nullable(),
    verify: z
      .object({
        url: z.url().optional(),
        authenticatedUrlPattern: z.string().optional(),
        authenticatedSelector: z.string().optional(),
        unauthenticatedUrlPattern: z.string().optional(),
      })
      .default({}),
  }),
});

export type Profile = z.infer<typeof ProfileSchema>;
