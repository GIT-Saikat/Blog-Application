import request from "supertest";
import express, { Router, } from "express";
import { jest } from "@jest/globals";
const mockPrismaClient = {
    post: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
};
const mockCreatePostSchema = {
    safeParse: jest.fn(),
};
const mockUpdatePostSchema = {
    safeParse: jest.fn(),
};
function createTestRouter() {
    const router = express.Router();
    const middleware = (req, res, next) => {
        req.userId = "test-user-id";
        next();
    };
    router.post("/posts", middleware, async (req, res) => {
        const parsedData = mockCreatePostSchema.safeParse(req.body);
        if (!parsedData.success || !req.userId || !parsedData.data) {
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
            res.json({
                message: "Post Created",
                postId: createPost.id,
            });
        }
        catch (e) {
            res.status(500).json({ message: "Unable to create Post" });
        }
    });
    router.get("/posts", middleware, async (req, res) => {
        try {
            const allPosts = await mockPrismaClient.post.findMany({
                include: {
                    author: {
                        select: { id: true, username: true, email: true },
                    },
                    comments: {
                        include: {
                            author: {
                                select: { id: true, username: true, email: true },
                            },
                        },
                    },
                },
                orderBy: { created_at: "desc" },
            });
            if (!allPosts) {
                return res.status(404).json({ message: "Posts not found" });
            }
            res.status(200).json({
                message: "Got all posts",
                allPosts: allPosts,
            });
        }
        catch (e) {
            res
                .status(500)
                .json({ message: "Error from server, not able to get post" });
        }
    });
    router.get("/posts/:postId", middleware, async (req, res) => {
        const postId = req.params.postId;
        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }
        try {
            const post = (await mockPrismaClient.post.findUnique({
                where: { id: postId },
                include: {
                    author: {
                        select: { id: true, username: true, email: true },
                    },
                    comments: {
                        include: {
                            author: {
                                select: { id: true, username: true, email: true },
                            },
                        },
                        orderBy: { created_at: "desc" },
                    },
                },
            }));
            if (!post) {
                return res.status(404).json({ message: "Post not found" });
            }
            res.status(200).json({
                message: "Got the single post",
                post,
            });
        }
        catch (e) {
            res.status(500).json({
                message: "Error from server, not able to get the single post",
            });
        }
    });
    router.put("/posts/:postId", middleware, async (req, res) => {
        const postId = req.params.postId;
        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }
        const parsedData = mockUpdatePostSchema.safeParse(req.body);
        if (!parsedData.success || !req.userId) {
            return res.status(400).json({ message: "Incorrect input" });
        }
        try {
            const postUpdate = (await mockPrismaClient.post.findUnique({
                where: { id: postId },
                select: { author_id: true },
            }));
            if (!postUpdate) {
                return res.status(404).json({ message: "Post not found" });
            }
            if (postUpdate.author_id !== req.userId) {
                return res.status(403).json({ message: "Invalid author" });
            }
            const updateData = {};
            if (parsedData.data && parsedData.data.title !== undefined)
                updateData.title = parsedData.data.title;
            if (parsedData.data && parsedData.data.content !== undefined)
                updateData.content = parsedData.data.content;
            const updatePost = await mockPrismaClient.post.update({
                where: { id: postId },
                data: updateData,
                include: {
                    author: {
                        select: { id: true, username: true, email: true },
                    },
                },
            });
            res.status(200).json({
                message: "Post updated",
                post: updatePost,
            });
        }
        catch (e) {
            res.status(500).json({ message: "Server error" });
        }
    });
    router.delete("/posts/:postId", middleware, async (req, res) => {
        const postId = req.params.postId;
        if (!postId) {
            return res.status(400).json({ message: "Post ID is required" });
        }
        try {
            const postDelete = (await mockPrismaClient.post.findUnique({
                where: { id: postId },
                select: { author_id: true },
            }));
            if (!postDelete) {
                return res.status(404).json({ message: "Post not found" });
            }
            if (postDelete.author_id !== req.userId) {
                return res.status(403).json({ message: "Invalid author" });
            }
            await mockPrismaClient.post.delete({
                where: { id: postId },
            });
            res.status(204).send();
        }
        catch (e) {
            res.status(500).json({ message: "Server error" });
        }
    });
    return router;
}
const postsRouter = createTestRouter();
describe("Posts API Tests", () => {
    let app;
    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use("/api", postsRouter);
        jest.clearAllMocks();
    });
    describe("POST /api/posts", () => {
        it("should create a post successfully", async () => {
            const mockPost = {
                id: "post-1",
                title: "Test Post",
                content: "Test content",
                author_id: "test-user-id",
                created_at: new Date(),
                updated_at: new Date(),
            };
            mockCreatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Test Post", content: "Test content" },
            });
            mockPrismaClient.post.create.mockResolvedValue(mockPost);
            const response = await request(app).post("/api/posts").send({
                title: "Test Post",
                content: "Test content",
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                message: "Post Created",
                postId: "post-1",
            });
            expect(mockPrismaClient.post.create).toHaveBeenCalledWith({
                data: {
                    author_id: "test-user-id",
                    title: "Test Post",
                    content: "Test content",
                },
            });
        });
        it("should return 400 for invalid input", async () => {
            mockCreatePostSchema.safeParse.mockReturnValue({
                success: false,
                error: { issues: [] },
            });
            const response = await request(app).post("/api/posts").send({
                title: "",
                content: "",
            });
            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Validationn Failed",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockCreatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Test Post", content: "Test content" },
            });
            mockPrismaClient.post.create.mockRejectedValue(new Error("Database error"));
            const response = await request(app).post("/api/posts").send({
                title: "Test Post",
                content: "Test content",
            });
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Unable to create Post",
            });
        });
    });
    describe("GET /api/posts", () => {
        it("should get all posts successfully", async () => {
            const mockAuthor = {
                id: "user-1",
                username: "testuser",
                email: "test@example.com",
            };
            const mockPosts = [
                {
                    id: "post-1",
                    title: "First Post",
                    content: "First content",
                    author_id: "user-1",
                    created_at: new Date("2024-01-01"),
                    updated_at: new Date("2024-01-01"),
                    author: mockAuthor,
                    comments: [],
                },
                {
                    id: "post-2",
                    title: "Second Post",
                    content: "Second content",
                    author_id: "user-2",
                    created_at: new Date("2024-01-02"),
                    updated_at: new Date("2024-01-02"),
                    author: {
                        ...mockAuthor,
                        id: "user-2",
                        username: "testuser2",
                        email: "test2@example.com",
                    },
                    comments: [],
                },
            ];
            mockPrismaClient.post.findMany.mockResolvedValue(mockPosts);
            const response = await request(app).get("/api/posts");
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Got all posts");
            expect(response.body.allPosts).toHaveLength(2);
            expect(mockPrismaClient.post.findMany).toHaveBeenCalled();
        });
        it("should return 500 when database error occurs", async () => {
            mockPrismaClient.post.findMany.mockRejectedValue(new Error("Database error"));
            const response = await request(app).get("/api/posts");
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Error from server, not able to get post",
            });
        });
    });
    describe("GET /api/posts/:postId", () => {
        it("should get a single post successfully", async () => {
            const mockPost = {
                id: "post-1",
                title: "Test Post",
                content: "Test content",
                author_id: "user-1",
                created_at: new Date("2024-01-01"),
                updated_at: new Date("2024-01-01"),
                author: {
                    id: "user-1",
                    username: "testuser",
                    email: "test@example.com",
                },
                comments: [
                    {
                        id: "comment-1",
                        content: "Test comment",
                        author: {
                            id: "user-2",
                            username: "commenter",
                            email: "commenter@example.com",
                        },
                    },
                ],
            };
            mockPrismaClient.post.findUnique.mockResolvedValue(mockPost);
            const response = await request(app).get("/api/posts/post-1");
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Got the single post");
            expect(response.body.post.title).toBe("Test Post");
            expect(response.body.post.comments).toHaveLength(1);
            expect(mockPrismaClient.post.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "post-1" } }));
        });
        it("should return 404 when post is not found", async () => {
            mockPrismaClient.post.findUnique.mockResolvedValue(null);
            const response = await request(app).get("/api/posts/post-1");
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                message: "Post not found",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockPrismaClient.post.findUnique.mockRejectedValue(new Error("Database error"));
            const response = await request(app).get("/api/posts/post-1");
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Error from server, not able to get the single post",
            });
        });
    });
    describe("PUT /api/posts/:postId", () => {
        const mockFindUniqueResult = { author_id: "test-user-id" };
        const mockUpdatedPost = {
            id: "post-1",
            title: "Updated Title",
            content: "Updated content",
            author_id: "test-user-id",
            author: {
                id: "test-user-id",
                username: "testuser",
                email: "test@example.com",
            },
        };
        it("should update a post successfully with title and content", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Updated Title", content: "Updated content" },
            });
            mockPrismaClient.post.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.post.update.mockResolvedValue(mockUpdatedPost);
            const response = await request(app).put("/api/posts/post-1").send({
                title: "Updated Title",
                content: "Updated content",
            });
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Post updated");
            expect(response.body.post.title).toBe("Updated Title");
            expect(mockPrismaClient.post.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: "post-1" },
                data: { title: "Updated Title", content: "Updated content" },
            }));
        });
        it("should update a post with only title", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Updated Title Only" },
            });
            mockPrismaClient.post.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.post.update.mockResolvedValue({
                ...mockUpdatedPost,
                title: "Updated Title Only",
                content: "Original content",
            });
            const response = await request(app).put("/api/posts/post-1").send({
                title: "Updated Title Only",
            });
            expect(response.status).toBe(200);
            expect(response.body.post.title).toBe("Updated Title Only");
            expect(mockPrismaClient.post.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: "post-1" },
                data: { title: "Updated Title Only" },
            }));
        });
        it("should update a post with only content", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Updated Content Only" },
            });
            mockPrismaClient.post.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.post.update.mockResolvedValue({
                ...mockUpdatedPost,
                content: "Updated Content Only",
                title: "Original title",
            });
            const response = await request(app).put("/api/posts/post-1").send({
                content: "Updated Content Only",
            });
            expect(response.status).toBe(200);
            expect(response.body.post.content).toBe("Updated Content Only");
        });
        it("should return 400 for invalid input", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: false,
                error: { issues: [] },
            });
            const response = await request(app).put("/api/posts/post-1").send({
                title: "",
            });
            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Incorrect input",
            });
        });
        it("should return 404 when post is not found", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Updated Title" },
            });
            mockPrismaClient.post.findUnique.mockResolvedValue(null);
            const response = await request(app).put("/api/posts/post-1").send({
                title: "Updated Title",
            });
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                message: "Post not found",
            });
        });
        it("should return 403 when user is not the author", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Updated Title" },
            });
            mockPrismaClient.post.findUnique.mockResolvedValue({
                author_id: "different-user-id",
            });
            const response = await request(app).put("/api/posts/post-1").send({
                title: "Updated Title",
            });
            expect(response.status).toBe(403);
            expect(response.body).toEqual({
                message: "Invalid author",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockUpdatePostSchema.safeParse.mockReturnValue({
                success: true,
                data: { title: "Updated Title" },
            });
            mockPrismaClient.post.findUnique.mockRejectedValue(new Error("Database error"));
            const response = await request(app).put("/api/posts/post-1").send({
                title: "Updated Title",
            });
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Server error",
            });
        });
    });
    describe("DELETE /api/posts/:postId", () => {
        const mockFindUniqueResult = { author_id: "test-user-id" };
        it("should delete a post successfully", async () => {
            mockPrismaClient.post.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.post.delete.mockResolvedValue({});
            const response = await request(app).delete("/api/posts/post-1");
            expect(response.status).toBe(204);
            expect(mockPrismaClient.post.delete).toHaveBeenCalledWith({
                where: { id: "post-1" },
            });
        });
        it("should return 404 when post is not found", async () => {
            mockPrismaClient.post.findUnique.mockResolvedValue(null);
            const response = await request(app).delete("/api/posts/post-1");
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                message: "Post not found",
            });
        });
        it("should return 403 when user is not the author", async () => {
            mockPrismaClient.post.findUnique.mockResolvedValue({
                author_id: "different-user-id",
            });
            const response = await request(app).delete("/api/posts/post-1");
            expect(response.status).toBe(403);
            expect(response.body).toEqual({
                message: "Invalid author",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockPrismaClient.post.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.post.delete.mockRejectedValue(new Error("Database error"));
            const response = await request(app).delete("/api/posts/post-1");
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Server error",
            });
        });
    });
});
//# sourceMappingURL=posts.test.js.map