import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.js";
export function middleware(req, res, next) {
    const token = req.headers["authorization"] ?? "";
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded) {
        req.userId = decoded.userId;
        next();
    }
    else {
        res.status(404).json({
            message: "Not Authorized"
        });
    }
}
//# sourceMappingURL=middleware.js.map