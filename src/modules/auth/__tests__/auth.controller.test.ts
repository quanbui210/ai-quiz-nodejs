import { Request, Response } from "express";
import { loginWithGoogle, getCurrentUser } from "../auth.controller";
import { supabase } from "../../../utils/supabase";

jest.mock("../../../utils/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      getUser: jest.fn(),
    },
  },
}));

describe("Auth Controller", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };
    jest.clearAllMocks();
  });

  describe("loginWithGoogle", () => {
    it("should return OAuth URL on success", async () => {
      const mockOAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth?...";
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: { url: mockOAuthUrl },
        error: null,
      });

      mockRequest = {
        query: {},
      };

      await loginWithGoogle(mockRequest as Request, mockResponse as Response);

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: expect.any(String),
          skipBrowserRedirect: false,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      expect(mockJson).toHaveBeenCalledWith({
        url: mockOAuthUrl,
        message: "Redirect user to this URL to complete Google login",
      });
    });

    it("should return error when OAuth fails", async () => {
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "OAuth failed" },
      });

      mockRequest = {
        query: {},
      };

      await loginWithGoogle(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: "OAuth failed" });
    });
  });

  describe("getCurrentUser", () => {
    it("should return user when authenticated", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRequest = {};

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({ user: mockUser });
    });

    it("should return error when not authenticated", async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockRequest = {};

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: "Not authenticated" });
    });
  });
});
