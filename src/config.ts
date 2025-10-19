import dotenv from "dotenv";

// Load .env in development. In production, set environment variables in the host.
dotenv.config();

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("Missing required environment variable: JWT_SECRET");
}

export const JWT_SECRET = secret;
