import express from "express";
import {
  createPostSchema,
  SigninSchem,
  updatePostSchema,
  UserSchema,
} from "./types/types.js";
import bcrypt from "bcrypt";
import { Client } from "./index.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.js";
import { middleware } from "./middleware.js";
import { Prisma } from "@prisma/client/extension";

const app = express();

app.use(express.json());

app.post("/register", async (req, res) => {
  const parsedData = UserSchema.safeParse(req.body);
  if (!parsedData.success) {
    console.log(parsedData.error);
    res.status(422).json({
      message: "Incorrect input",
    });
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(parsedData.data.password, 10);
    const user = await Client.user.create({
      data: {
        username: parsedData.data.username,
        password: hashedPassword,
        email: parsedData.data.email,
      },
    });
    res.json({
      message: "Registration successfull",
      userId: user.id,
    });
  } catch (e) {
    res.status(409).json({
      message: "User Already exists",
    });
  }
});

app.post("/login", async (req, res) => {
  const parsedData = SigninSchem.safeParse(req.body);
  if (!parsedData.success) {
    console.log(parsedData.error);
    res.status(422).json({
      message: "Invalid Input",
    });
    return;
  }

  let user;
  if (parsedData.data.username) {
    user = await Client.user.findUnique({
      where: {
        username: parsedData.data.username,
      },
    });
    console.log(typeof user);
    console.log(user);
  } else if (parsedData.data.email) {
    user = await Client.user.findUnique({
      where: {
        email: parsedData.data.email,
      },
    });
  }

  if (!user) {
    res.status(404).json({
      message: "Not Authorized",
    });
    return;
  }

  const isPassword = await bcrypt.compare(
    parsedData.data.password,
    user.password
  );

  if (!isPassword) {
    res.status(401).json({
      message: "Not correct password",
    });
    return;
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({
    message: "Login successful",
    token: token,
  });
});

app.post("/posts", middleware, async (req, res) => {
  const parsedData = createPostSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(400).json({
      message: "Validationn Failed",
    });
    return;
  }
  try {
    const createPost = await Client.post.create({
      data: {
        author_id: req.userId as string | undefined,
        title: parsedData.data.title,
        content: parsedData.data.content,
      },
    });
    res.json({
      message: "Post Created",
      postId: createPost.id,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "Unable to create Post",
    });
  }
});

app.get("/posts", middleware, async (req, res) => {
  try {
    const allPosts = await Client.post.findMany({
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        comments: {
          include: {
            athor: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (!allPosts) {
      res.status(404).json({
        message: "Posts not found",
      });
      return;
    }

    res.status(200).json({
      message: "Got all posts",
      allPosts: allPosts,
    });
  } catch (e) {
    res.status(500).json({
      message: "Error from server, not able to get post",
    });
  }
});

app.get("/posts/:postId", middleware, async (req, res) => {
  const postId = req.params.postId;
  try {
    const post = await Client.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        comments: {
          include: {
            athor: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
        },
      },
    });

    if (!post) {
      res.status(404).json({
        message: "Post not found",
      });
      return;
    }

    res.status(200).json({
      message: "Got the single post",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "Error from server, not able to get the single post",
    });
  }
});

app.put("/posts/:postId", middleware, async (req, res) => {
  const postId = req.params.postId;
  const parsedData = updatePostSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(400).json({
      message: "Incorrect input",
    });
    return;
  }

  try {
    const postUpdate = await Client.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        author_id: true,
      },
    });

    if (!postUpdate) {
      res.status(404).json({
        message: "Post not found",
      });
      return;
    }

    if (postUpdate.author_id !== req.userId) {
      res.status(403).json({
        message: "Invalid author",
      });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsedData.data.title !== undefined)
      updateData.title = parsedData.data.title;
    if (parsedData.data.content !== undefined)
      updateData.content = parsedData.data.content;

    const updatePost = await Client.post.update({
      where: {
        id: postId,
      },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });
    res.status(200).json({
      message: "Post updated",
      post: updatePost,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "Server error",
    });
  }
});

app.delete("/posts/:postId", middleware, async (req, res) => {
  const postId = req.params.postId;
  try {
    const postDelete = await Client.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        author_id: true,
      },
    });

    if (!postDelete) {
      res.status(404).json({
        message: "Post not found",
      });
      return;
    }

    if (postDelete.author_id !== req.userId) {
      res.status(403).json({
        message: "Invalid author",
      });
      return;
    }

    await Client.post.delete({
      where: {
        id: postId,
      },
    });

    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "Server error",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
