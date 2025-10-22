import request from "supertest";
import express, { Router, } from "express";
import { jest } from "@jest/globals";
// --- External Mock Implementations (Typing required for integration) ---
// Use dynamic imports to prevent issues with jest/globals environment
const bcrypt = {
    hash: jest.fn(),
    compare: jest.fn(),
};
const jwt = {
    sign: jest.fn(),
    verify: jest.fn(),
};
// --- Mock Prisma Client (Consolidated) ---
const mockPrismaClient = {
    user: {
        create: jest.fn(),
        findUnique: jest.fn(),
    },
    post: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    comment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
};
// --- Mock Validation Schemas ---
const mockUserSchema = {
    safeParse: jest.fn(),
};
const mockSigninSchema = {
    safeParse: jest.fn(),
};
const mockCreatePostSchema = {
    safeParse: jest.fn(),
};
const mockUpdatePostSchema = {
    safeParse: jest.fn(),
};
const mockCommentSchema = {
    safeParse: jest.fn(),
};
const JWT_SECRET = "test-secret-key";
// --- Integrated App Setup ---
/** Creates the full integrated Express application with all mocked routes. */
function createIntegratedApp() {
    const app = express();
    app.use(express.json());
    // Middleware for authentication check
    const middleware = (req, res, next) => {
        const token = req.headers["authorization"] || "";
        try {
            // Cast the return value of verify to the expected payload shape
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userId = decoded.userId;
            next();
        }
        catch (e) {
            res.status(404).json({ message: "Not Authorized" });
        }
    };
    // --- Authentication Routes ---
    app.post("/register", async (req, res) => {
        const parsedData = mockUserSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data) {
            return res.status(422).json({ message: "Incorrect input" });
        }
        try {
            const { username, password, email } = parsedData.data;
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await mockPrismaClient.user.create({
                data: { username, password: hashedPassword, email },
            });
            res.json({ message: "Registration successfull", userId: user.id });
        }
        catch (e) {
            res.status(409).json({ message: "User Already exists" });
        }
    });
    app.post("/login", async (req, res) => {
        const parsedData = mockSigninSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data) {
            return res.status(422).json({ message: "Invalid Input" });
        }
        const { password, username, email } = parsedData.data;
        let user = null;
        if (username) {
            user = await mockPrismaClient.user.findUnique({ where: { username } });
        }
        else if (email) {
            user = await mockPrismaClient.user.findUnique({ where: { email } });
        }
        if (!user) {
            return res.status(404).json({ message: "Not Authorized" });
        }
        const isPassword = await bcrypt.compare(password, user.password);
        if (!isPassword) {
            return res.status(401).json({ message: "Not correct password" });
        }
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
            expiresIn: "1h",
        });
        res.json({ message: "Login successful", token: token });
    });
    // --- Posts Routes ---
    app.post("/posts", middleware, async (req, res) => {
        const parsedData = mockCreatePostSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data || !req.userId) {
            return res.status(400).json({ message: "Validationn Failed" });
        }
        try {
            const createPost = await mockPrismaClient.post.create({
                data: {
                    author_id: req.userId,
                    title: parsedData.data.title,
                    content: parsedData.data.content,
                },
            });
            res.json({ message: "Post Created", postId: createPost.id });
        }
        catch (e) {
            res.status(500).json({ message: "Unable to create Post" });
        }
    });
    app.get("/posts", middleware, async (req, res) => {
        try {
            // Cast is necessary as the mock's return type needs to be asserted for the endpoint
            const allPosts = (await mockPrismaClient.post.findMany({}));
            res.status(200).json({ message: "Got all posts", allPosts: allPosts });
        }
        catch (e) {
            res
                .status(500)
                .json({ message: "Error from server, not able to get post" });
        }
    });
    app.get("/posts/:postId", middleware, async (req, res) => {
        const postId = req.params.postId;
        try {
            // Cast the return to ensure correct type access (Post with relations)
            const post = (await mockPrismaClient.post.findUnique({
                where: { id: postId },
            }));
            if (!post) {
                return res.status(404).json({ message: "Post not found" });
            }
            res.status(200).json({ message: "Got the single post", post });
        }
        catch (e) {
            res
                .status(500)
                .json({
                message: "Error from server, not able to get the single post",
            });
        }
    });
    // --- Comments Routes ---
    app.post("/comments", middleware, async (req, res) => {
        const parsedData = mockCommentSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data || !req.userId) {
            return res.status(400).json({ message: "Invalid input" });
        }
        const postId = parsedData.data.post_id;
        if (!postId) {
            return res.status(400).json({ message: "postId is required" });
        }
        try {
            const comment = (await mockPrismaClient.comment.create({
                data: {
                    post_id: postId,
                    content: parsedData.data.content,
                    author_id: req.userId,
                },
                include: { author: true },
            }));
            res
                .status(201)
                .json({ message: "Comment created", commentId: comment.id });
        }
        catch (e) {
            res.status(500).json({ message: "Unable to create comment" });
        }
    });
    app.get("/comments/post/:postId", middleware, async (req, res) => {
        try {
            // Cast the return to ensure correct array type
            const comments = (await mockPrismaClient.comment.findMany({
                where: { post_id: req.params.postId },
                include: {
                    author: { select: { id: true, username: true, email: true } },
                },
                orderBy: { created_at: "desc" },
            }));
            res.json({ message: "Got comments", comments });
        }
        catch (e) {
            res.status(500).json({ message: "Unable to fetch comments" });
        }
    });
    return app;
}
// --- Jest Test Suite ---
describe("Integration Tests", () => {
    let app;
    let authToken;
    beforeEach(() => {
        app = createIntegratedApp();
        // Use jest.clearAllMocks() to reset all mock function calls and return values
        jest.clearAllMocks();
        authToken = null;
    });
    describe("Complete User Flow: Register -> Login -> Create Post -> Comment", () => {
        it("should complete full user journey successfully", async () => {
            // --- Step 1: Register a new user ---
            const mockUser = {
                id: "user-123",
                username: "testuser",
                email: "test@example.com",
                password: "hashed-password",
            };
            mockUserSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "testuser",
                    email: "test@example.com",
                    password: "password123",
                },
            });
            // Re-mocking bcrypt and Prisma for the initial flow
            bcrypt.hash.mockResolvedValue("hashed-password");
            mockPrismaClient.user.create.mockResolvedValue(mockUser);
            const registerResponse = await request(app)
                .post("/register")
                .send({
                username: "testuser",
                email: "test@example.com",
                password: "password123",
            });
            expect(registerResponse.status).toBe(200);
            // --- Step 2: Login with the registered user ---
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: { username: "testuser", password: "password123" },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("valid-jwt-token");
            const loginResponse = await request(app)
                .post("/login")
                .send({ username: "testuser", password: "password123" });
            expect(loginResponse.status).toBe(200);
            authToken = loginResponse.body.token;
            expect(authToken).toBe("valid-jwt-token");
            // --- Step 3: Create a post with authenticated user ---
            const mockPost = {
                id: "post-456",
                title: "My First Post",
                content: "This is my first post content",
                author_id: "user-123",
                created_at: new Date(),
                updated_at: new Date(),
            };
            mockCreatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    title: "My First Post",
                    content: "This is my first post content",
                },
            });
            jwt.verify.mockReturnValue({ userId: "user-123" });
            mockPrismaClient.post.create.mockResolvedValue(mockPost);
            const createPostResponse = await request(app)
                .post("/posts")
                .set("Authorization", authToken)
                .send({
                title: "My First Post",
                content: "This is my first post content",
            });
            expect(createPostResponse.status).toBe(200);
            expect(createPostResponse.body.postId).toBe("post-456");
            // --- Step 4: Add a comment to the post ---
            const mockComment = {
                id: "comment-789",
                post_id: "post-456",
                content: "Great post!",
                author_id: "user-123",
                created_at: new Date(),
                updated_at: new Date(),
            };
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Great post!", post_id: "post-456" },
            });
            mockPrismaClient.comment.create.mockResolvedValue(mockComment);
            const createCommentResponse = await request(app)
                .post("/comments")
                .set("Authorization", authToken)
                .send({ content: "Great post!", post_id: "post-456" });
            expect(createCommentResponse.status).toBe(201);
            expect(createCommentResponse.body.commentId).toBe("comment-789");
            // Verify all interactions happened in order
            expect(mockPrismaClient.user.create).toHaveBeenCalledTimes(1);
            expect(mockPrismaClient.user.findUnique).toHaveBeenCalledTimes(1);
            expect(mockPrismaClient.post.create).toHaveBeenCalledTimes(1);
            expect(mockPrismaClient.comment.create).toHaveBeenCalledTimes(1);
        });
        it("should retrieve post with comments after creation", async () => {
            // Setup authenticated user
            jwt.verify.mockReturnValue({ userId: "user-123" });
            authToken = "valid-jwt-token";
            const mockPostWithComments = {
                id: "post-456",
                title: "Test Post",
                content: "Test content",
                author_id: "user-123",
                author: {
                    id: "user-123",
                    username: "testuser",
                    email: "test@example.com",
                },
                comments: [
                    {
                        id: "comment-1",
                        post_id: "post-456",
                        content: "First comment",
                        author_id: "user-123",
                        author: {
                            id: "user-123",
                            username: "testuser",
                            email: "test@example.com",
                        },
                    },
                    {
                        id: "comment-2",
                        post_id: "post-456",
                        content: "Second comment",
                        author_id: "user-456",
                        author: {
                            id: "user-456",
                            username: "anotheruser",
                            email: "another@example.com",
                        },
                    },
                ],
            };
            mockPrismaClient.post.findUnique.mockResolvedValue(mockPostWithComments);
            const response = await request(app)
                .get("/posts/post-456")
                .set("Authorization", authToken);
            expect(response.status).toBe(200);
            expect(response.body.post.comments).toHaveLength(2);
            expect(response.body.post.comments[0].content).toBe("First comment");
        });
    });
    describe("Authentication and Authorization Flow", () => {
        it("should reject requests without authentication token", async () => {
            jwt.verify.mockImplementation(() => {
                throw new Error("jwt must be provided");
            });
            const response = await request(app)
                .post("/posts")
                .send({ title: "Test Post", content: "Test content" });
            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Not Authorized");
        });
        it("should successfully process requests with valid token", async () => {
            jwt.verify.mockReturnValue({ userId: "user-123" });
            mockCreatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Test Post", content: "Test content" },
            });
            const mockPost = {
                id: "post-123",
                title: "Test Post",
                content: "Test content",
                author_id: "user-123",
            };
            mockPrismaClient.post.create.mockResolvedValue(mockPost);
            const response = await request(app)
                .post("/posts")
                .set("Authorization", "valid-token")
                .send({ title: "Test Post", content: "Test content" });
            expect(response.status).toBe(200);
            expect(jwt.verify).toHaveBeenCalledWith("valid-token", JWT_SECRET);
        });
    });
    describe("Error Propagation Across Components", () => {
        it("should handle database errors during post creation after successful login", async () => {
            // Successful login mock setup
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: { username: "testuser", password: "password123" },
            });
            const mockUser = {
                id: "user-123",
                username: "testuser",
                password: "hashed-password",
                email: "a@b.c",
            };
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("valid-token");
            await request(app)
                .post("/login")
                .send({ username: "testuser", password: "password123" });
            // Database error during post creation
            jwt.verify.mockReturnValue({ userId: "user-123" });
            mockCreatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Test Post", content: "Test content" },
            });
            mockPrismaClient.post.create.mockRejectedValue(new Error("Database connection failed"));
            const postResponse = await request(app)
                .post("/posts")
                .set("Authorization", "valid-token")
                .send({ title: "Test Post", content: "Test content" });
            expect(postResponse.status).toBe(500);
            expect(postResponse.body.message).toBe("Unable to create Post");
        });
    });
});
//# sourceMappingURL=integration.test.js.map