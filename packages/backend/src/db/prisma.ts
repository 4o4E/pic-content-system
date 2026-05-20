import { PrismaClient } from "@prisma/client";
import { ensureDotEnvLoaded } from "../config/env.js";

ensureDotEnvLoaded();
export const prisma = new PrismaClient();
