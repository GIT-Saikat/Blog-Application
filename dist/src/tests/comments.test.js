import request from "supertest";
import express, { Router, } from "express";
import { jest } from "@jest/globals";
const mockPrismaClient = {
    comment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
};
const mockCommentSchema = {
    safeParse: jest.fn(),
};
function createTestRouter() {
    const router = express.Router();
    const middleware = (req, res, next) => {
        req.userId = "test-user-id";
        next();
    };
    router.post("/comments", middleware, async (req, res) => {
        const parsedData = mockCommentSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data) {
            return res.status(400).json({ message: "Invalid input" });
        }
        const postId = req.body.post_id;
        if (!postId) {
            return res.status(400).json({ message: "postId is required" });
        }
        if (!req.userId) {
            return res.status(401).json({ message: "Unauthorized" });
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
    router.get("/comments", middleware, async (req, res) => {
        try {
            const allComments = await mockPrismaClient.comment.findMany({
                select: {
                    author: {
                        select: { id: true, username: true },
                    },
                    id: true,
                    content: true,
                    created_at: true,
                    updated_at: true,
                },
                orderBy: { created_at: "desc" },
            });
            res.status(200).json({ allComments, message: "Get all comments" });
        }
        catch (e) {
            res.status(500).json({ message: "Server error" });
        }
    });
    router.get("/post/:postId", middleware, async (req, res) => {
        try {
            const comments = (await mockPrismaClient.comment.findMany({
                where: { post_id: req.params.postId },
                include: {
                    author: {
                        select: { id: true, username: true, email: true },
                    },
                },
                orderBy: { created_at: "desc" },
            }));
            res.json({ message: "Got comments", comments });
        }
        catch (e) {
            res.status(500).json({ message: "Unable to fetch comments" });
        }
    });
    router.put("/comments/:commentId", middleware, async (req, res) => {
        const parsedData = mockCommentSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data || !req.userId) {
            return res.status(400).json({ message: "Invalid input" });
        }
        try {
            const found = await mockPrismaClient.comment.findUnique({
                where: { id: req.params.commentId },
                select: { author_id: true },
            });
            if (!found)
                return res.status(404).json({ message: "Comment not found" });
            if (found.author_id !== req.userId) {
                return res.status(403).json({ message: "Invalid author" });
            }
            const updated = (await mockPrismaClient.comment.update({
                where: { id: req.params.commentId },
                data: { content: parsedData.data.content },
            }));
            res.json({ message: "Comment updated", comment: updated });
        }
        catch (e) {
            res.status(500).json({ message: "Unable to update comment" });
        }
    });
    router.delete("/comments/:commentId", middleware, async (req, res) => {
        if (!req.userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        try {
            const found = await mockPrismaClient.comment.findUnique({
                where: { id: req.params.commentId },
                select: { author_id: true },
            });
            if (!found)
                return res.status(404).json({ message: "Comment not found" });
            if (found.author_id !== req.userId) {
                return res.status(403).json({ message: "Invalid author" });
            }
            await mockPrismaClient.comment.delete({
                where: { id: req.params.commentId },
            });
            res.status(204).send();
        }
        catch (e) {
            res.status(500).json({ message: "Unable to delete comment" });
        }
    });
    return router;
}
const commentsRouter = createTestRouter();
describe("Comments API Tests", () => {
    let app;
    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use("/api", commentsRouter);
        jest.clearAllMocks();
    });
    describe("POST /api/comments", () => {
        const mockComment = {
            id: "comment-1",
            post_id: "post-1",
            content: "Test comment",
            author_id: "test-user-id",
            created_at: new Date(),
            updated_at: new Date(),
        };
        it("should create a comment successfully", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Test comment" },
            });
            mockPrismaClient.comment.create.mockResolvedValue(mockComment);
            const response = await request(app).post("/api/comments").send({
                content: "Test comment",
                post_id: "post-1",
            });
            expect(response.status).toBe(201);
            expect(response.body).toEqual({
                message: "Comment created",
                commentId: "comment-1",
            });
            expect(mockPrismaClient.comment.create).toHaveBeenCalledWith(expect.objectContaining({
                data: {
                    post_id: "post-1",
                    content: "Test comment",
                    author_id: "test-user-id",
                },
            }));
        });
        it("should return 400 for invalid input", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: false,
                error: { issues: [] },
            });
            const response = await request(app).post("/api/comments").send({
                content: "",
                post_id: "post-1",
            });
            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Invalid input",
            });
        });
        it("should return 400 when postId is missing", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Test comment" },
            });
            const response = await request(app).post("/api/comments").send({
                content: "Test comment",
            });
            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "postId is required",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Test comment" },
            });
            mockPrismaClient.comment.create.mockRejectedValue(new Error("Database error"));
            const response = await request(app).post("/api/comments").send({
                content: "Test comment",
                post_id: "post-1",
            });
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Unable to create comment",
            });
        });
    });
    describe("GET /api/comments", () => {
        it("should get all comments successfully", async () => {
            const mockComments = [
                {
                    id: "comment-1",
                    content: "First comment",
                    created_at: new Date("2024-01-01"),
                    updated_at: new Date("2024-01-01"),
                    author: {
                        id: "user-1",
                        username: "testuser",
                    },
                },
                {
                    id: "comment-2",
                    content: "Second comment",
                    created_at: new Date("2024-01-02"),
                    updated_at: new Date("2024-01-02"),
                    author: {
                        id: "user-2",
                        username: "testuser2",
                    },
                },
            ];
            mockPrismaClient.comment.findMany.mockResolvedValue(mockComments);
            const response = await request(app).get("/api/comments");
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Get all comments");
            expect(response.body.allComments).toHaveLength(2);
            expect(mockPrismaClient.comment.findMany).toHaveBeenCalled();
        });
        it("should return 500 when database error occurs", async () => {
            mockPrismaClient.comment.findMany.mockRejectedValue(new Error("Database error"));
            const response = await request(app).get("/api/comments");
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Server error",
            });
        });
    });
    describe("GET /api/post/:postId", () => {
        it("should get comments for a specific post", async () => {
            const mockComments = [
                {
                    id: "comment-1",
                    post_id: "post-1",
                    content: "Comment for post",
                    author_id: "user-1",
                    created_at: new Date("2024-01-01"),
                    updated_at: new Date("2024-01-01"),
                    author: {
                        id: "user-1",
                        username: "testuser",
                        email: "test@example.com",
                    },
                },
            ];
            mockPrismaClient.comment.findMany.mockResolvedValue(mockComments);
            const response = await request(app).get("/api/post/post-1");
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Got comments");
            expect(response.body.comments).toHaveLength(1);
            expect(response.body.comments[0].content).toBe("Comment for post");
            expect(mockPrismaClient.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { post_id: "post-1" } }));
        });
        it("should return 500 when database error occurs", async () => {
            mockPrismaClient.comment.findMany.mockRejectedValue(new Error("Database error"));
            const response = await request(app).get("/api/post/post-1");
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Unable to fetch comments",
            });
        });
    });
    describe("PUT /api/comments/:commentId", () => {
        const mockFindUniqueResult = { author_id: "test-user-id" };
        const mockUpdatedComment = {
            id: "comment-1",
            post_id: "post-1",
            content: "Updated comment",
            author_id: "test-user-id",
            created_at: new Date("2024-01-01"),
            updated_at: new Date("2024-01-02"),
        };
        it("should update a comment successfully", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Updated comment" },
            });
            mockPrismaClient.comment.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.comment.update.mockResolvedValue(mockUpdatedComment);
            const response = await request(app).put("/api/comments/comment-1").send({
                content: "Updated comment",
            });
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Comment updated");
            expect(response.body.comment.content).toBe("Updated comment");
            expect(mockPrismaClient.comment.update).toHaveBeenCalledWith({
                where: { id: "comment-1" },
                data: { content: "Updated comment" },
            });
        });
        it("should return 400 for invalid input", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: false,
                error: { issues: [] },
            });
            const response = await request(app).put("/api/comments/comment-1").send({
                content: "",
            });
            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Invalid input",
            });
        });
        it("should return 404 when comment is not found", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Updated comment" },
            });
            mockPrismaClient.comment.findUnique.mockResolvedValue(null);
            const response = await request(app).put("/api/comments/comment-1").send({
                content: "Updated comment",
            });
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                message: "Comment not found",
            });
        });
        it("should return 403 when user is not the author", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Updated comment" },
            });
            mockPrismaClient.comment.findUnique.mockResolvedValue({
                author_id: "different-user-id",
            });
            const response = await request(app).put("/api/comments/comment-1").send({
                content: "Updated comment",
            });
            expect(response.status).toBe(403);
            expect(response.body).toEqual({
                message: "Invalid author",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockCommentSchema.safeParse.mockReturnValue({
                success: true,
                data: { content: "Updated comment" },
            });
            mockPrismaClient.comment.findUnique.mockRejectedValue(new Error("Database error"));
            const response = await request(app).put("/api/comments/comment-1").send({
                content: "Updated comment",
            });
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Unable to update comment",
            });
        });
    });
    describe("DELETE /api/comments/:commentId", () => {
        const mockFindUniqueResult = { author_id: "test-user-id" };
        it("should delete a comment successfully", async () => {
            mockPrismaClient.comment.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.comment.delete.mockResolvedValue({});
            const response = await request(app).delete("/api/comments/comment-1");
            expect(response.status).toBe(204);
            expect(mockPrismaClient.comment.delete).toHaveBeenCalledWith({
                where: { id: "comment-1" },
            });
        });
        it("should return 404 when comment is not found", async () => {
            mockPrismaClient.comment.findUnique.mockResolvedValue(null);
            const response = await request(app).delete("/api/comments/comment-1");
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                message: "Comment not found",
            });
        });
        it("should return 403 when user is not the author", async () => {
            mockPrismaClient.comment.findUnique.mockResolvedValue({
                author_id: "different-user-id",
            });
            const response = await request(app).delete("/api/comments/comment-1");
            expect(response.status).toBe(403);
            expect(response.body).toEqual({
                message: "Invalid author",
            });
        });
        it("should return 500 when database error occurs", async () => {
            mockPrismaClient.comment.findUnique.mockResolvedValue(mockFindUniqueResult);
            mockPrismaClient.comment.delete.mockRejectedValue(new Error("Database error"));
            const response = await request(app).delete("/api/comments/comment-1");
            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Unable to delete comment",
            });
        });
    });
});
//# sourceMappingURL=comments.test.js.map