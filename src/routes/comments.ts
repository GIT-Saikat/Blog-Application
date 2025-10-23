import express from "express";
import { CommentSchema } from "../types/types.js";
import { Client } from "../index.js";
import { middleware } from "../middleware.js";

const router = express.Router();

router.post("/comments", middleware, async (req, res) => {
  const parsedData = CommentSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(400).json({
      message: "Invalid input",
    });
    return;
  }

  const content = parsedData.data.content;
  const postId = req.body.post_id;

  if (!postId) {
    res.status(400).json({
      message: "postId is required",
    });
    return;
  }

  try {
    const comment = await Client.comment.create({
      data: {
        post_id: postId,
        content: content,
        author_id: req.userId as string,
      },
      include:{athor:true}
    });

    res.status(201).json({ message: "Comment created", commentId: comment.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Unable to create comment" });
  }
});

router.get("/comments", middleware, async (req, res) => {
  try {
    const allComments = await Client.comment.findMany({
      select: {
        athor: {
          select: {
            id: true,
            username: true,
          },
        },
        id: true,
        content: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (!allComments) {
      res.status(404).json({
        message: "Post not found",
      });
    }
    res.status(200).json({
      allComments: allComments,
      message: "Get all comments",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "Server error",
    });
  }
});


router.get("/post/:postId", middleware, async (req, res) => {
  const postId = req.params.postId as string;
  try {
    const comments = await Client.comment.findMany({
      where: { post_id: postId },
      include: {
        athor: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ message: "Got comments", comments });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Unable to fetch comments" });
  }
});


router.put("/comments/:commentId", middleware, async (req, res) => {
  const commentId = req.params.commentId as string;
  const parsedData = CommentSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }

  try {
    const found = await Client.comment.findUnique({
      where: { id: commentId },
      select: { author_id: true },
    });
    if (!found) return res.status(404).json({ message: "Comment not found" });
    if (found.author_id !== req.userId)
      return res.status(403).json({ message: "Invalid author" });

    const updated = await Client.comment.update({
      where: { id: commentId },
      data: { content: parsedData.data.content },
    });
    res.json({ message: "Comment updated", comment: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Unable to update comment" });
  }
});

router.delete("/comments/:commentId", middleware, async (req, res) => {
  const commentId = req.params.commentId as string;
  try {
    const found = await Client.comment.findUnique({
      where: { id: commentId },
      select: { author_id: true },
    });
    if (!found) return res.status(404).json({ message: "Comment not found" });
    if (found.author_id !== req.userId)
      return res.status(403).json({ message: "Invalid author" });

    await Client.comment.delete({ where: { id: commentId } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Unable to delete comment" });
  }
});

export default router;
