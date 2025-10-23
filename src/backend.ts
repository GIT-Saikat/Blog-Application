import express from "express";
import {
  SigninSchem,
  UserSchema,
} from "./types/types.js";
import bcrypt from "bcrypt";
import { Client } from "./index.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.js";
import postsRouter from "./routes/posts.js";
import commentsRouter from "./routes/comments.js";

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

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });
  res.json({
    message: "Login successful",
    token: token,
  });
});


app.use("/posts", postsRouter);
app.use("/comments", commentsRouter);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});