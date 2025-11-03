// web/lib/prisma.js
import { PrismaClient } from "@prisma/client";

let prisma = global._prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global._prisma = prisma;
}

export default prisma;
