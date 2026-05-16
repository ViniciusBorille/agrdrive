import { InternalServerError } from "infra/errors";
import authorization from "models/authorization";
import { create } from "node:domain";
import Username from "pages/api/v1/users/[username]";

describe("models/authorization.js", () => {
  describe(".can()", () => {
    test("without `user`", () => {
      expect(() => {
        authorization.can();
      }).toThrow(InternalServerError);
    });
    test("without `user.features`", () => {
      const createdUser = {
        username: "UserWithoutFeatures",
      };
      expect(() => {
        authorization.can(createdUser);
      }).toThrow(InternalServerError);
    });
    test("with unknown `feature`", () => {
      const createdUser = {
        features: [],
      };
      expect(() => {
        authorization.can(createdUser, "unknown:feature");
      }).toThrow(InternalServerError);
    });
    test("with valid `user` and known `feature`", () => {
      const createdUser = {
        features: ["create:user"],
      };
      expect(authorization.can(createdUser, "create:user")).toBe(true);
    });
  });
  describe(".filterOutput()", () => {
    test("without `user`", () => {
      expect(() => {
        authorization.filterOutput();
      }).toThrow(InternalServerError);
    });
    test("without `user.features`", () => {
      const createdUser = {
        username: "UserWithoutFeatures",
      };
      expect(() => {
        authorization.filterOutput(createdUser);
      }).toThrow(InternalServerError);
    });
    test("with unknown `feature`", () => {
      const createdUser = {
        features: [],
      };
      expect(() => {
        authorization.filterOutput(createdUser, "unknown:feature");
      }).toThrow(InternalServerError);
    });
    test("with valid `user`, known `feature` but no `resource`", () => {
      const createdUser = {
        features: ["read:user"],
      };
      expect(() => {
        authorization.filterOutput(createdUser, "read:user");
      }).toThrow(InternalServerError);
    });
    test("with valid `user`, known `feature` ande `resource`", () => {
      const createdUser = {
        features: ["read:user"],
      };

      const resource = {
        id: 1,
        username: "resource",
        features: ["read:user"],
        role: "gestor",
        created_at: "2026-0101T00:00:00.000Z",
        updated_at: "2026-0101T00:00:00.000Z",
        email: "resource@resource.com",
        password: "resource",
      };

      const results = authorization.filterOutput(
        createdUser,
        "read:user",
        resource,
      );
      expect(results).toEqual({
        id: 1,
        username: "resource",
        features: ["read:user"],
        role: "gestor",
        created_at: "2026-0101T00:00:00.000Z",
        updated_at: "2026-0101T00:00:00.000Z",
      });
    });
  });
});
