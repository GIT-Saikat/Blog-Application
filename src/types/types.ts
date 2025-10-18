import z from "zod";
export const UserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters long.")
    .max(20, "Username can't be longer than 20 characters."),

  email: z.string().min(1, "Email is required."),

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

  email: z.string().min(1, "Email is required.").optional(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(30, "Password can't be longer than 30 characters."),
});

export const createPostSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters long.")
    .max(20, "Title should not be more than 20 characters."),

  content: z.string().min(3, "Content must be at least 3 characters long."),
});

export const updatePostSchema = z.object({
    title:z
    .string()
    .min(3,"Title must be at least 3 characters long.")
    .max(20,"Title should not be more than 20 characters.")
    .optional(),

    content:z
    .string()
    .min(3,"Content must be at least 3 characters long.")
    .optional()
}).refine(data=>data.title || data.content)

// export const updatePostSchema = createPostSchema
//   .partial()
//   .refine((data) => data.title || data.content, {
//     message: "One field inut is manddatory",
//   });

export const CommentSchema = z.object({
  content: z
    .string()
    .min(3, "Comment content must be at least 3 characters long.")
    .max(500, "Comment content should not be more than 500 characters."),
});
