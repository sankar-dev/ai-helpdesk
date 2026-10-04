-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'agent');

-- Convert existing text values in place instead of dropping the column
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'agent';
