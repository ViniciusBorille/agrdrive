import orchestrator from "tests/orchestrator"
import { version as uuidVersion } from "uuid";
import session from "models/session.js";

beforeAll(async () => {
    await orchestrator.waitForAllServices();
    await orchestrator.clearDatabase();
    await orchestrator.runPendingMigrations();
});

describe("GET /api/v1/user", () => {
    describe("Default user", () => {
        test("With valid session", async () => {
            const createdUser = await orchestrator.createUser({
                username: "UserWithValidSession",
            });

            const sessionObject = await orchestrator.createSession(createdUser.id)

            const response = await fetch("http://localhost:3000/api/v1/user", {
                headers: {
                    Cookie: `session_id=${sessionObject.token}`
                }
            });

            expect(response.status).toBe(200);

            const responseBody = await response.json();

            expect(responseBody).toEqual({
                id: createdUser.id,
                username: "UserWithValidSession",
                email: createdUser.email,
                password: createdUser.password,
                role: createdUser.role,
                created_at: createdUser.created_at.toISOString(),
                updated_at: createdUser.updated_at.toISOString(),
            });

            expect(uuidVersion(responseBody.id)).toBe(4);
            expect(Date.parse(responseBody.created_at)).not.toBeNaN();
            expect(Date.parse(responseBody.updated_at)).not.toBeNaN();
        });
        test("With nonexistent session", async () => {
            const nonexistentToken = " 5575f9a11eddcc674f50cbd1492fdc8cff2966f37c093d4acbca670ad182f7a8e014e51ccb09691ce666e8de8b812ad5";

            const response = await fetch("http://localhost:3000/api/v1/user", {
                headers: {
                    Cookie: `session_id=${nonexistentToken}`
                }
            });

            expect(response.status).toBe(401);

            const responseBody = await response.json();

            expect(responseBody).toEqual({
                name: "UnauthorizedError",
                message: "Usuário não possui sessão ativa.",
                action: "Verifique se este usuário está logado e tente novamente.",
                status_code: 401,
            });
        });
        test("With expired session", async () => {
            jest.useFakeTimers({
                now: new Date(Date.now() - session.EXPIRATION_IN_MILISECONDS)
            });

            const createdUser = await orchestrator.createUser({
                username: "UserWithExpiredSession",
            });

            const sessionObject = await orchestrator.createSession(createdUser.id)

            jest.useRealTimers();

            const response = await fetch("http://localhost:3000/api/v1/user", {
                headers: {
                    Cookie: `session_id=${sessionObject.token}`
                }
            });

            expect(response.status).toBe(401);

            const responseBody = await response.json();

            expect(responseBody).toEqual({
                name: "UnauthorizedError",
                message: "Usuário não possui sessão ativa.",
                action: "Verifique se este usuário está logado e tente novamente.",
                status_code: 401,
            });
        });
    });
});