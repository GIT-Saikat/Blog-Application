import z from "zod";
export declare const UserSchema: z.ZodObject<{
    username: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, z.z.core.$strip>;
export declare const SigninSchem: z.ZodObject<{
    username: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodString;
}, z.z.core.$strip>;
//# sourceMappingURL=types.d.ts.map