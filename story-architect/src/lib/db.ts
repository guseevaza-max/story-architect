import { PrismaClient } from "@prisma/client";

// Один общий PrismaClient на всё приложение.
// В dev-режиме Next.js перезагружает модули, поэтому клиент
// кладём в globalThis, чтобы не плодить соединения с базой.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
