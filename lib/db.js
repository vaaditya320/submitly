import { PrismaClient } from '@prisma/client';
const globalDb = globalThis;
export const db = globalDb.submitlyDb || new PrismaClient({ log: [] });
if (process.env.NODE_ENV !== 'production') globalDb.submitlyDb = db;
