/**
 * Loads environment variables BEFORE any other imports.
 * Must be listed first in setupFiles to ensure DATABASE_URL etc.
 * are available when Prisma client initializes.
 */
import { config } from "dotenv";
import path from "path";

const root = path.resolve(__dirname, "../..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.production") });
config({ path: path.join(root, ".env.local"), override: true });
