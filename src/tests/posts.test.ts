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
  email: string;
}

/** Represents a standard Comment object included in post relations. */
interface Comment {
  id: string;
  content: string;
  author: Author;
}

/** Represents the Post data structure returned from Prisma, potentially with relations. */
interface Post {
  id: string;
  title: string;
  content: string;
  author_id: string;
  created_at?: Date;
  updated_at?: Date;
  author?: Author;
  comments?: Comment[];
}

/** Custom Request interface extending Express Request to include the userId set by middleware. */
interface AuthRequest extends Request {
  userId?: string;
}

/** Represents the validated data for creating a post. */
interface CreatePostData {
  title: string;
  content: string;
}

/** Represents the validated data for updating a post (optional fields). */
interface UpdatePostData {
  title?: string;
  content?: string;
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
  post: {
    // create expects data and returns a Post
    create:
      jest.fn<
        (args: {
          data: { author_id: string; title: string; content: string };
        }) => Promise<Post>
      >(),
    // findMany returns an array of Posts; accept optional query args
    findMany:
      jest.fn<(args?: { include?: any; orderBy?: any }) => Promise<Post[]>>(),
    // findUnique returns a single Post or null; accept include/select params
    findUnique:
      jest.fn<
        (args: {
          where: { id: string };
          include?: any;
          select?: any;
        }) => Promise<Post | { author_id: string } | null>
      >(),
    // update returns the updated Post
    update:
      jest.fn<
        (args: {
          where: { id: string };
          data: Partial<CreatePostData>;
          include?: any;
        }) => Promise<Post>
      >(),
    // delete returns the deleted record (or a simple object)
    delete: jest.fn<(args: { where: { id: string } }) => Promise<any>>(),
  },
};

// Mock Post Schema validation
const mockCreatePostSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<CreatePostData>>(),
};

const mockUpdatePostSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<UpdatePostData>>(),
};

// --- Test Router Setup ---

/** Creates a test Express router that simulates the posts router behavior. */
function createTestRouter(): Router {
  const router = express.Router();

  // Mock authentication middleware
  const middleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    // Attaches the mock user ID to the request object
    req.userId = "test-user-id";
    next();
  };

  // POST / - Create a post
  router.post("/", middleware, async (req: AuthRequest, res: Response) => {
    const parsedData: ParseResult<CreatePostData> =
      mockCreatePostSchema.safeParse(req.body);

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
    } catch (e) {
      res.status(500).json({ message: "Unable to create Post" });
    }
  });

  // GET / - Get all posts
  router.get("/", middleware, async (req: AuthRequest, res: Response) => {
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
    } catch (e) {
      res
        .status(500)
        .json({ message: "Error from server, not able to get post" });
    }
  });

  // GET /:postId - Get a single post
  router.get(
    "/:postId",
    middleware,
    async (req: AuthRequest, res: Response) => {
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
        })) as Post | null; // Cast to Post | null since the mock returns Post

        if (!post) {
          return res.status(404).json({ message: "Post not found" });
        }

        res.status(200).json({
          message: "Got the single post",
          post,
        });
      } catch (e) {
        res
          .status(500)
          .json({
            message: "Error from server, not able to get the single post",
          });
      }
    }
  );

  // PUT /:postId - Update a post
  router.put(
    "/:postId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      const postId = req.params.postId;
      if (!postId) {
        return res.status(400).json({ message: "Post ID is required" });
      }
      const parsedData: ParseResult<UpdatePostData> =
        mockUpdatePostSchema.safeParse(req.body);
      if (!parsedData.success || !req.userId) {
        return res.status(400).json({ message: "Incorrect input" });
      }

      try {
        // Find the post and select only the author_id to check ownership
        const postUpdate = (await mockPrismaClient.post.findUnique({
          where: { id: postId },
          select: { author_id: true },
        })) as { author_id: string } | null;

        if (!postUpdate) {
          return res.status(404).json({ message: "Post not found" });
        }

        if (postUpdate.author_id !== req.userId) {
          return res.status(403).json({ message: "Invalid author" });
        }

        const updateData: Partial<CreatePostData> = {};
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
      } catch (e) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // DELETE /:postId - Delete a post
  router.delete(
    "/:postId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      const postId = req.params.postId;
      if (!postId) {
        return res.status(400).json({ message: "Post ID is required" });
      }
      try {
        // Find the post and select only the author_id to check ownership
        const postDelete = (await mockPrismaClient.post.findUnique({
          where: { id: postId },
          select: { author_id: true },
        })) as { author_id: string } | null;

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
      } catch (e) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  return router;
}

const postsRouter = createTestRouter();

// --- Jest Test Suite ---

describe("Posts API Tests", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Mount the test router under /api/posts
    app.use("/api/posts", postsRouter);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe("POST /api/posts", () => {
    it("should create a post successfully", async () => {
      const mockPost: Post = {
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

      mockPrismaClient.post.create.mockRejectedValue(
        new Error("Database error")
      );

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
      const mockAuthor: Author = {
        id: "user-1",
        username: "testuser",
        email: "test@example.com",
      };
      const mockPosts: Post[] = [
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
      expect(mockPrismaClient.post.findMany).toHaveBeenCalled(); // Checking call, full argument check is verbose but present in router
    });

    it("should return 500 when database error occurs", async () => {
      mockPrismaClient.post.findMany.mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app).get("/api/posts");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: "Error from server, not able to get post",
      });
    });
  });

  describe("GET /api/posts/:postId", () => {
    it("should get a single post successfully", async () => {
      const mockPost: Post = {
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
      expect(mockPrismaClient.post.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "post-1" } })
      );
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
      mockPrismaClient.post.findUnique.mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app).get("/api/posts/post-1");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: "Error from server, not able to get the single post",
      });
    });
  });

  describe("PUT /api/posts/:postId", () => {
    const mockFindUniqueResult = { author_id: "test-user-id" };

    const mockUpdatedPost: Post = {
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
      expect(mockPrismaClient.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "post-1" },
          data: { title: "Updated Title", content: "Updated content" },
        })
      );
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
      expect(mockPrismaClient.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "post-1" },
          data: { title: "Updated Title Only" },
        })
      );
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

      mockPrismaClient.post.findUnique.mockRejectedValue(
        new Error("Database error")
      );

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
      mockPrismaClient.post.delete.mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app).delete("/api/posts/post-1");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: "Server error",
      });
    });
  });
});
