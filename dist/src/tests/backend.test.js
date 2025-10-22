import request from "supertest";
import express, {} from "express";
import { jest } from "@jest/globals";
// --- Mock Implementations ---
// Mock bcrypt with strong type casting for async methods
const bcrypt = {
    hash: jest.fn(),
    compare: jest.fn(),
};
// Mock jsonwebtoken with strong type casting
const jwt = {
    sign: jest.fn(),
};
// Mock Prisma Client with strong type casting for mock DB operations
const mockPrismaClient = {
    user: {
        create: jest.fn(),
        findUnique: jest.fn(),
    },
};
// Mock User Schema validation (e.g., Zod)
const mockUserSchema = {
    safeParse: jest.fn(),
};
const mockSigninSchema = {
    safeParse: jest.fn(),
};
// Mock JWT_SECRET
const JWT_SECRET = "test-secret-key";
// --- Test Application Setup ---
/** Creates a test Express application with mocked routes. */
function createTestApp() {
    const app = express();
    app.use(express.json());
    // POST /register - User registration
    app.post("/register", async (req, res) => {
        // Type the parsedData result correctly
        const parsedData = mockUserSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data) {
            return res.status(422).json({ message: "Incorrect input" });
        }
        try {
            const { username, email, password } = parsedData.data;
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await mockPrismaClient.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                },
            });
            res.json({
                message: "Registration successfull",
                userId: user.id,
            });
        }
        catch (e) {
            // Assuming a unique constraint error
            res.status(409).json({ message: "User Already exists" });
        }
    });
    // POST /login - User login
    app.post("/login", async (req, res) => {
        // Type the parsedData result correctly
        const parsedData = mockSigninSchema.safeParse(req.body);
        if (!parsedData.success || !parsedData.data) {
            return res.status(422).json({ message: "Invalid Input" });
        }
        const { password, username, email } = parsedData.data;
        let user = null;
        // Use type narrowing to determine the find criteria
        if (username) {
            user = await mockPrismaClient.user.findUnique({
                where: { username },
            });
        }
        else if (email) {
            user = await mockPrismaClient.user.findUnique({
                where: { email },
            });
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
        res.json({
            message: "Login successful",
            token: token,
        });
    });
    return app;
}
// --- Test Suite ---
describe("Backend API Tests", () => {
    let app;
    beforeEach(() => {
        app = createTestApp();
        // Reset all mocks before each test
        jest.clearAllMocks();
    });
    describe("POST /register", () => {
        it("should register a user successfully", async () => {
            const mockUser = {
                id: "user-1",
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
            bcrypt.hash.mockResolvedValue("hashed-password");
            mockPrismaClient.user.create.mockResolvedValue(mockUser);
            const response = await request(app).post("/register").send({
                username: "testuser",
                email: "test@example.com",
                password: "password123",
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                message: "Registration successfull",
                userId: "user-1",
            });
            expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
            expect(mockPrismaClient.user.create).toHaveBeenCalledWith({
                data: {
                    username: "testuser",
                    email: "test@example.com",
                    password: "hashed-password",
                },
            });
        });
        it("should return 422 for invalid input", async () => {
            mockUserSchema.safeParse.mockReturnValue({
                success: false,
                error: { issues: [] },
            });
            const response = await request(app).post("/register").send({
                username: "ab",
                email: "",
                password: "short",
            });
            expect(response.status).toBe(422);
            expect(response.body).toEqual({
                message: "Incorrect input",
            });
        });
        it("should return 409 when user already exists", async () => {
            mockUserSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "existinguser",
                    email: "existing@example.com",
                    password: "password123",
                },
            });
            bcrypt.hash.mockResolvedValue("hashed-password");
            // Mocking the Prisma error case
            mockPrismaClient.user.create.mockRejectedValue(new Error("Unique constraint failed"));
            const response = await request(app).post("/register").send({
                username: "existinguser",
                email: "existing@example.com",
                password: "password123",
            });
            expect(response.status).toBe(409);
            expect(response.body).toEqual({
                message: "User Already exists",
            });
        });
        it("should hash the password before storing", async () => {
            const mockUser = {
                id: "user-1",
                username: "testuser",
                email: "test@example.com",
                password: "hashed-password",
            };
            mockUserSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "testuser",
                    email: "test@example.com",
                    password: "plaintext-password",
                },
            });
            bcrypt.hash.mockResolvedValue("hashed-password");
            mockPrismaClient.user.create.mockResolvedValue(mockUser);
            await request(app).post("/register").send({
                username: "testuser",
                email: "test@example.com",
                password: "plaintext-password",
            });
            expect(bcrypt.hash).toHaveBeenCalledWith("plaintext-password", 10);
            expect(mockPrismaClient.user.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    password: "hashed-password",
                }),
            }));
        });
    });
    describe("POST /login", () => {
        const mockUser = {
            id: "user-1",
            username: "testuser",
            email: "test@example.com",
            password: "hashed-password",
        };
        it("should login successfully with username", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "testuser",
                    password: "password123",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("jwt-token-123");
            const response = await request(app).post("/login").send({
                username: "testuser",
                password: "password123",
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                message: "Login successful",
                token: "jwt-token-123",
            });
            expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
                where: { username: "testuser" },
            });
            expect(bcrypt.compare).toHaveBeenCalledWith("password123", "hashed-password");
            expect(jwt.sign).toHaveBeenCalledWith({ userId: "user-1" }, JWT_SECRET, {
                expiresIn: "1h",
            });
        });
        it("should login successfully with email", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    email: "test@example.com",
                    password: "password123",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("jwt-token-456");
            const response = await request(app).post("/login").send({
                email: "test@example.com",
                password: "password123",
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                message: "Login successful",
                token: "jwt-token-456",
            });
            expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
                where: { email: "test@example.com" },
            });
        });
        it("should return 422 for invalid input", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: false,
                error: { issues: [] },
            });
            const response = await request(app).post("/login").send({
                username: "",
                password: "short",
            });
            expect(response.status).toBe(422);
            expect(response.body).toEqual({
                message: "Invalid Input",
            });
        });
        it("should return 404 when user is not found", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "nonexistent",
                    password: "password123",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(null);
            const response = await request(app).post("/login").send({
                username: "nonexistent",
                password: "password123",
            });
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                message: "Not Authorized",
            });
        });
        it("should return 401 for incorrect password", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "testuser",
                    password: "wrongpassword",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(false);
            const response = await request(app).post("/login").send({
                username: "testuser",
                password: "wrongpassword",
            });
            expect(response.status).toBe(401);
            expect(response.body).toEqual({
                message: "Not correct password",
            });
            expect(bcrypt.compare).toHaveBeenCalledWith("wrongpassword", "hashed-password");
        });
        it("should generate JWT token with correct payload and expiration", async () => {
            const specificMockUser = {
                id: "user-123",
                username: "testuser",
                email: "test@example.com",
                password: "hashed-password",
            };
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "testuser",
                    password: "password123",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(specificMockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("jwt-token");
            await request(app).post("/login").send({
                username: "testuser",
                password: "password123",
            });
            expect(jwt.sign).toHaveBeenCalledWith({ userId: "user-123" }, JWT_SECRET, { expiresIn: "1h" });
        });
        it("should handle login with username when email is not provided", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    username: "testuser",
                    password: "password123",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("jwt-token");
            const response = await request(app).post("/login").send({
                username: "testuser",
                password: "password123",
            });
            expect(response.status).toBe(200);
            expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
                where: { username: "testuser" },
            });
        });
        it("should handle login with email when username is not provided", async () => {
            mockSigninSchema.safeParse.mockReturnValue({
                success: true,
                data: {
                    email: "test@example.com",
                    password: "password123",
                },
            });
            mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue("jwt-token");
            const response = await request(app).post("/login").send({
                email: "test@example.com",
                password: "password123",
            });
            expect(response.status).toBe(200);
            expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
                where: { email: "test@example.com" },
            });
        });
    });
});
//# sourceMappingURL=backend.test.js.map