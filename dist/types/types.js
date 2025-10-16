import z from "zod";
export const UserSchema = z.object({
    username: z
        .string()
        .min(3, "Username must be at least 3 characters long.")
        .max(20, "Username can't be longer than 20 characters."),
    email: z
        .string()
        .min(1, "Email is required"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters long.")
        .max(30, "Password can't be longer than 30 characters."),
});
export const SigninSchem = z.object({
    username: z
        .string()
        .min(3, "Username must be at least 3 characters long.")
        .max(20, "Username can't be longer than 20 characters.")
        .optional(),
    email: z
        .string()
        .min(1, "Email is required")
        .optional(),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters long.")
        .max(30, "Password can't be longer than 30 characters."),
});
//# sourceMappingURL=types.js.map