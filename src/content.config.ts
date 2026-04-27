import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.enum(['Pokémon TCG', 'Reviews', 'Guías', 'Noticias', 'Personal']).default('Pokémon TCG'),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

const expansiones = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/expansiones' }),
  schema: z.object({
    nombre: z.string(),
    codigo: z.string(),
    serie: z.string(),
    fechaLanzamiento: z.coerce.date(),
    totalCartas: z.number(),
    descripcion: z.string(),
    color: z.string().default('#ffcb05'),
    destacada: z.boolean().default(false),
    cartaDestacada: z.string().optional(),
    cartaDestacadaAlt: z.string().optional(),
  }),
});

export const collections = { blog, expansiones };
