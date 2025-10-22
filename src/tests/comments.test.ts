import request from "supertest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  Router,
} from "express";
import { jest } from "@jest/globals";

// --- Type Definitions for Mocks and Data Structures ---

/** Represents a standard Author object included in relations. */
interface Author {
  id: string;
  username: string;
  email?: string; // Email is sometimes included, sometimes not
}

/** Represents the validated data for creating or updating a comment. */
interface CommentData {
  content: string;
  post_id?: string; // Only required for POST (creation)
}

/** Represents the Comment data structure returned from Prisma. */
interface Comment {
  id: string;
  post_id: string;
  content: string;
  author_id: string;
  created_at: Date;
  updated_at: Date;
  author?: Author;
}

/** Custom Request interface extending Express Request to include the userId set by middleware. */
interface AuthRequest extends Request {
  userId?: string;
}

/** Utility type for the mocked Schema safeParse return value. */
interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: { issues: any[] };
}

// --- Mock Implementations ---

// Mock Prisma Client with strong type casting
const mockPrismaClient = {
  comment: {
    // create expects data and returns a Comment
    create:
      jest.fn<
        (args: {
          data: { post_id: string; content: string; author_id: string };
          include?: any;
        }) => Promise<Comment>
      >(),
    // findMany returns an array of Comments (or partial comments based on select/include)
    findMany:
      jest.fn<
        (args?: {
          select?: any;
          orderBy?: any;
          where?: any;
          include?: any;
        }) => Promise<Partial<Comment>[]>
      >(),
    // findUnique returns a single Comment or null, sometimes with specific selects (like author_id)
    findUnique:
      jest.fn<
        (args: {
          where: { id?: string };
          select?: any;
        }) => Promise<{ author_id: string } | null>
      >(),
    // update returns the updated Comment
    update:
      jest.fn<
        (args: {
          where: { id?: string };
          data: { content: string };
        }) => Promise<Comment>
      >(),
    // delete returns the deleted record (or a simple object)
    delete: jest.fn<(args: { where: { id?: string } }) => Promise<any>>(),
  },
};

// Mock Comment Schema validation
const mockCommentSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<CommentData>>(),
};

// --- Test Router Setup ---

/** Creates a test Express router that simulates the comments router behavior. */
function createTestRouter(): Router {
  const router = express.Router();

  // Mock authentication middleware
  const middleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    // Attaches the mock user ID to the request object
    req.userId = "test-user-id";
    next();
  };

  // POST /comments - Create a comment
  router.post(
    "/comments",
    middleware,
    async (req: AuthRequest, res: Response) => {
      const parsedData: ParseResult<CommentData> = mockCommentSchema.safeParse(
        req.body
      );

      if (!parsedData.success || !parsedData.data) {
        return res.status(400).json({ message: "Invalid input" });
      }

      // Since post_id is expected in req.body for this route
      const postId: string | undefined = req.body.post_id;
      if (!postId) {
        return res.status(400).json({ message: "postId is required" });
      }

      if (!req.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      try {
        // Cast is necessary here because the mock is generic but the endpoint expects a full Comment return
        const comment = (await mockPrismaClient.comment.create({
          data: {
            post_id: postId,
            content: parsedData.data.content,
            author_id: req.userId,
          },
          include: { author: true },
        })) as Comment;

        res
          .status(201)
          .json({ message: "Comment created", commentId: comment.id });
      } catch (e) {
        res.status(500).json({ message: "Unable to create comment" });
      }
    }
  );

  // GET /comments - Get all comments
  router.get(
    "/comments",
    middleware,
    async (req: AuthRequest, res: Response) => {
      try {
        // The findMany select criteria means it returns a partial Comment,
        // but we use the generic Partial<Comment>[] for the mock return type.
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
      } catch (e) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // GET /post/:postId - Get comments for a post
  router.get(
    "/post/:postId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      try {
        // Cast the mock response to the expected Comment[] array
        const comments = (await mockPrismaClient.comment.findMany({
          where: { post_id: req.params.postId },
          include: {
            author: {
              select: { id: true, username: true, email: true },
            },
          },
          orderBy: { created_at: "desc" },
        })) as Comment[];

        res.json({ message: "Got comments", comments });
      } catch (e) {
        res.status(500).json({ message: "Unable to fetch comments" });
      }
    }
  );

  // PUT /comments/:commentId - Update a comment
  router.put(
    "/comments/:commentId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      const parsedData: ParseResult<CommentData> = mockCommentSchema.safeParse(
        req.body
      );
      if (!parsedData.success || !parsedData.data || !req.userId) {
        return res.status(400).json({ message: "Invalid input" });
      }

      try {
        // Find the comment and select only the author_id to check ownership
        const found = await mockPrismaClient.comment.findUnique({
          where: { id: req.params.commentId as string },
          select: { author_id: true },
        });

        if (!found)
          return res.status(404).json({ message: "Comment not found" });
        if (found.author_id !== req.userId) {
          return res.status(403).json({ message: "Invalid author" });
        }

        // Cast is necessary here because the mock is generic but the endpoint expects a full Comment return
        const updated = (await mockPrismaClient.comment.update({
          where: { id: req.params.commentId as string },
          data: { content: parsedData.data.content },
        })) as Comment;

        res.json({ message: "Comment updated", comment: updated });
      } catch (e) {
        res.status(500).json({ message: "Unable to update comment" });
      }
    }
  );

  // DELETE /comments/:commentId - Delete a comment
  router.delete(
    "/comments/:commentId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      if (!req.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      try {
        // Find the comment and select only the author_id to check ownership
        const found = await mockPrismaClient.comment.findUnique({
          where: { id: req.params.commentId as string },
          select: { author_id: true },
        });

        if (!found)
          return res.status(404).json({ message: "Comment not found" });
        if (found.author_id !== req.userId) {
          return res.status(403).json({ message: "Invalid author" });
        }

        await mockPrismaClient.comment.delete({
          where: { id: req.params.commentId as string },
        });
        res.status(204).send();
      } catch (e) {
        res.status(500).json({ message: "Unable to delete comment" });
      }
    }
  );

  return router;
}

const commentsRouter = createTestRouter();

// --- Jest Test Suite ---

describe("Comments API Tests", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Mount the test router under /api
    app.use("/api", commentsRouter);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe("POST /api/comments", () => {
    const mockComment: Comment = {
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
      expect(mockPrismaClient.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            post_id: "post-1",
            content: "Test comment",
            author_id: "test-user-id",
          },
        })
      );
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

      mockPrismaClient.comment.create.mockRejectedValue(
        new Error("Database error")
      );

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
      const mockComments: Partial<Comment>[] = [
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
      // Checking only the mock call itself, as the argument structure is complex and checked in the router setup
      expect(mockPrismaClient.comment.findMany).toHaveBeenCalled();
    });

    it("should return 500 when database error occurs", async () => {
      mockPrismaClient.comment.findMany.mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app).get("/api/comments");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: "Server error",
      });
    });
  });

  describe("GET /api/post/:postId", () => {
    it("should get comments for a specific post", async () => {
      const mockComments: Comment[] = [
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
      expect(mockPrismaClient.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { post_id: "post-1" } })
      );
    });

    it("should return 500 when database error occurs", async () => {
      mockPrismaClient.comment.findMany.mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app).get("/api/post/post-1");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: "Unable to fetch comments",
      });
    });
  });

  describe("PUT /api/comments/:commentId", () => {
    const mockFindUniqueResult = { author_id: "test-user-id" };
    const mockUpdatedComment: Comment = {
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

      mockPrismaClient.comment.findUnique.mockResolvedValue(
        mockFindUniqueResult
      );
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

      mockPrismaClient.comment.findUnique.mockRejectedValue(
        new Error("Database error")
      );

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
      mockPrismaClient.comment.findUnique.mockResolvedValue(
        mockFindUniqueResult
      );
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
      mockPrismaClient.comment.findUnique.mockResolvedValue(
        mockFindUniqueResult
      );
      mockPrismaClient.comment.delete.mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app).delete("/api/comments/comment-1");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: "Unable to delete comment",
      });
    });
  });
});
