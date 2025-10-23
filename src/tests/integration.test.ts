import request from "supertest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  Router,
} from "express";
import { jest } from "@jest/globals";

const bcrypt: any = {
  hash: jest.fn(),
  compare: jest.fn(),
};

const jwt: any = {
  sign: jest.fn(),
  verify: jest.fn(),
};

interface Author {
  id: string;
  username: string;
  email: string;
}
interface Comment {
  id: string;
  post_id: string;
  content: string;
  author_id: string;
  author?: Author;
  created_at?: Date;
  updated_at?: Date;
}
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

interface User {
  id: string;
  username: string;
  email: string;
  password: string;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
}
interface SigninData {
  username?: string;
  email?: string;
  password: string;
}
interface CreatePostData {
  title: string;
  content: string;
}
interface CommentData {
  content: string;
  post_id: string;
}
interface UpdatePostData {
  title?: string;
  content?: string;
}

interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: { issues: any[] };
}

interface AuthRequest extends Request {
  userId?: string;
}


const mockPrismaClient: any = {
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

const mockUserSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<RegisterData>>(),
};
const mockSigninSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<SigninData>>(),
};
const mockCreatePostSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<CreatePostData>>(),
};
const mockUpdatePostSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<UpdatePostData>>(),
};
const mockCommentSchema = {
  safeParse: jest.fn<(data: any) => ParseResult<CommentData>>(),
};

const JWT_SECRET = "test-secret-key";

function createIntegratedApp(): Express {
  const app = express();
  app.use(express.json());

  const middleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = (req.headers["authorization"] as string) || "";
    try {

      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      req.userId = decoded.userId;
      next();
    } catch (e) {
      res.status(404).json({ message: "Not Authorized" });
    }
  };

  app.post("/register", async (req: AuthRequest, res: Response) => {
    const parsedData: ParseResult<RegisterData> = mockUserSchema.safeParse(
      req.body
    );
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
    } catch (e) {
      res.status(409).json({ message: "User Already exists" });
    }
  });

  app.post("/login", async (req: AuthRequest, res: Response) => {
    const parsedData: ParseResult<SigninData> = mockSigninSchema.safeParse(
      req.body
    );
    if (!parsedData.success || !parsedData.data) {
      return res.status(422).json({ message: "Invalid Input" });
    }

    const { password, username, email } = parsedData.data;
    let user: User | null = null;

    if (username) {
      user = await mockPrismaClient.user.findUnique({ where: { username } });
    } else if (email) {
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

  app.post("/posts", middleware, async (req: AuthRequest, res: Response) => {
    const parsedData: ParseResult<CreatePostData> =
      mockCreatePostSchema.safeParse(req.body);
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
    } catch (e) {
      res.status(500).json({ message: "Unable to create Post" });
    }
  });

  app.get("/posts", middleware, async (req: AuthRequest, res: Response) => {
    try {
      const allPosts = (await mockPrismaClient.post.findMany({})) as Post[];
      res.status(200).json({ message: "Got all posts", allPosts: allPosts });
    } catch (e) {
      res
        .status(500)
        .json({ message: "Error from server, not able to get post" });
    }
  });

  app.get(
    "/posts/:postId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      const postId = req.params.postId;
      try {

        const post = (await mockPrismaClient.post.findUnique({
          where: { id: postId },
        })) as Post | null;

        if (!post) {
          return res.status(404).json({ message: "Post not found" });
        }
        res.status(200).json({ message: "Got the single post", post });
      } catch (e) {
        res
          .status(500)
          .json({
            message: "Error from server, not able to get the single post",
          });
      }
    }
  );

  app.post("/comments", middleware, async (req: AuthRequest, res: Response) => {
    const parsedData: ParseResult<CommentData> = mockCommentSchema.safeParse(
      req.body
    );
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
      })) as Comment;
      res
        .status(201)
        .json({ message: "Comment created", commentId: comment.id });
    } catch (e) {
      res.status(500).json({ message: "Unable to create comment" });
    }
  });

  app.get(
    "/comments/post/:postId",
    middleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const comments = (await mockPrismaClient.comment.findMany({
          where: { post_id: req.params.postId },
          include: {
            author: { select: { id: true, username: true, email: true } },
          },
          orderBy: { created_at: "desc" },
        })) as Comment[];
        res.json({ message: "Got comments", comments });
      } catch (e) {
        res.status(500).json({ message: "Unable to fetch comments" });
      }
    }
  );

  return app;
}


describe("Integration Tests", () => {
  let app: Express;
  let authToken: string | null;

  beforeEach(() => {
    app = createIntegratedApp();

    jest.clearAllMocks();
    authToken = null;
  });

  describe("Complete User Flow: Register -> Login -> Create Post -> Comment", () => {
    it("should complete full user journey successfully", async () => {

      const mockUser: User = {
        id: "user-123",
        username: "testuser",
        email: "test@example.com",
        password: "hashed-password",
      } as User;

      mockUserSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        },
      });

      
      (bcrypt.hash as any).mockResolvedValue("hashed-password");
      (mockPrismaClient.user.create as any).mockResolvedValue(mockUser);

      const registerResponse = await request(app)
        .post("/register")
        .send({
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        });

      expect(registerResponse.status).toBe(200);

      mockSigninSchema.safeParse.mockReturnValue({
        success: true,
        data: { username: "testuser", password: "password123" },
      });

      (mockPrismaClient.user.findUnique as any).mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue("valid-jwt-token");

      const loginResponse = await request(app)
        .post("/login")
        .send({ username: "testuser", password: "password123" });

      expect(loginResponse.status).toBe(200);
      authToken = loginResponse.body.token;
      expect(authToken).toBe("valid-jwt-token");

      const mockPost: Post = {
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

      (jwt.verify as any).mockReturnValue({ userId: "user-123" });
      (mockPrismaClient.post.create as any).mockResolvedValue(mockPost);

      const createPostResponse = await request(app)
        .post("/posts")
        .set("Authorization", authToken as string)
        .send({
          title: "My First Post",
          content: "This is my first post content",
        });

      expect(createPostResponse.status).toBe(200);
      expect(createPostResponse.body.postId).toBe("post-456");

      const mockComment: Comment = {
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

      (mockPrismaClient.comment.create as any).mockResolvedValue(mockComment);

      const createCommentResponse = await request(app)
        .post("/comments")
        .set("Authorization", authToken as string)
        .send({ content: "Great post!", post_id: "post-456" });

      expect(createCommentResponse.status).toBe(201);
      expect(createCommentResponse.body.commentId).toBe("comment-789");

      expect(mockPrismaClient.user.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.post.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.comment.create).toHaveBeenCalledTimes(1);
    });

    it("should retrieve post with comments after creation", async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ userId: "user-123" });
      authToken = "valid-jwt-token";

      const mockPostWithComments: Post = {
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
        ] as Comment[],
      } as Post;

      (mockPrismaClient.post.findUnique as any).mockResolvedValue(
        mockPostWithComments
      );

      const response = await request(app)
        .get("/posts/post-456")
        .set("Authorization", authToken as string);

      expect(response.status).toBe(200);
      expect(response.body.post.comments).toHaveLength(2);
      expect(response.body.post.comments[0].content).toBe("First comment");
    });
  });

  describe("Authentication and Authorization Flow", () => {
    it("should reject requests without authentication token", async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("jwt must be provided");
      });

      const response = await request(app)
        .post("/posts")
        .send({ title: "Test Post", content: "Test content" });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Not Authorized");
    });

    it("should successfully process requests with valid token", async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ userId: "user-123" });
      mockCreatePostSchema.safeParse.mockReturnValue({
        success: true,
        data: { title: "Test Post", content: "Test content" },
      });

      const mockPost: Post = {
        id: "post-123",
        title: "Test Post",
        content: "Test content",
        author_id: "user-123",
      } as Post;
      (mockPrismaClient.post.create as any).mockResolvedValue(mockPost);

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
      mockSigninSchema.safeParse.mockReturnValue({
        success: true,
        data: { username: "testuser", password: "password123" },
      });
      const mockUser: User = {
        id: "user-123",
        username: "testuser",
        password: "hashed-password",
        email: "a@b.c",
      } as User;
      (mockPrismaClient.user.findUnique as any).mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue("valid-token");

      await request(app)
        .post("/login")
        .send({ username: "testuser", password: "password123" });


      (jwt.verify as jest.Mock).mockReturnValue({ userId: "user-123" });
      mockCreatePostSchema.safeParse.mockReturnValue({
        success: true,
        data: { title: "Test Post", content: "Test content" },
      });

      (mockPrismaClient.post.create as any).mockRejectedValue(
        new Error("Database connection failed")
      );

      const postResponse = await request(app)
        .post("/posts")
        .set("Authorization", "valid-token")
        .send({ title: "Test Post", content: "Test content" });

      expect(postResponse.status).toBe(500);
      expect(postResponse.body.message).toBe("Unable to create Post");
    });
  });
});
