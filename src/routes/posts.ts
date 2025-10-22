import express from "express";
import { createPostSchema, updatePostSchema } from "../types/types.js";
import { Client } from "../index.js";
import { middleware } from "../middleware.js";

const router = express.Router();

router.post("/", middleware, async (req, res) => {
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

router.get("/", middleware, async (req, res) => {
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

router.get("/:postId", middleware, async (req, res) => {
  const postId = req.params.postId;
  if (!postId) {
    res.status(400).json({ message: "Post ID is required" });
    return;
  }
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
      post,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "Error from server, not able to get the single post",
    });
  }
});

router.put("/:postId", middleware, async (req, res) => {
  const postId = req.params.postId;
  if (!postId) {
    res.status(400).json({ message: "Post ID is required" });
    return;
  }
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

router.delete("/:postId", middleware, async (req, res) => {
  const postId = req.params.postId;
  if (!postId) {
    res.status(400).json({ message: "Post ID is required" });
    return;
  }
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

export default router;
