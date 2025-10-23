import dotenv from "dotenv";
dotenv.config();
const secret = process.env.JWT_SECRET;
if (!secret) {
    throw new Error("Missing required environment variable: JWT_SECRET");
}
export const JWT_SECRET = secret;
//# sourceMappingURL=config.js.map