import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      summary: z.string().default(''),
      cover: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { posts };
