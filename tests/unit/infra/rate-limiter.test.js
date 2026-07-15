import rateLimiter from "@/infra/rate-limiter.js";

describe("infra/rate-limiter", () => {
  test("allows requests under the limit", () => {
    const limiter = rateLimiter.createRateLimiter({
      windowMs: 60_000,
      max: 3,
    });

    expect(limiter.consume("ip-1").allowed).toBe(true);
    expect(limiter.consume("ip-1").allowed).toBe(true);
    expect(limiter.consume("ip-1").allowed).toBe(true);
  });

  test("blocks requests over the limit", () => {
    const limiter = rateLimiter.createRateLimiter({
      windowMs: 60_000,
      max: 2,
    });

    limiter.consume("ip-1");
    limiter.consume("ip-1");

    expect(limiter.consume("ip-1").allowed).toBe(false);
  });

  test("tracks keys independently", () => {
    const limiter = rateLimiter.createRateLimiter({
      windowMs: 60_000,
      max: 1,
    });

    expect(limiter.consume("ip-1").allowed).toBe(true);
    expect(limiter.consume("ip-1").allowed).toBe(false);
    expect(limiter.consume("ip-2").allowed).toBe(true);
  });

  test("resets the counter after the window expires", () => {
    jest.useFakeTimers();

    const limiter = rateLimiter.createRateLimiter({
      windowMs: 1_000,
      max: 1,
    });

    expect(limiter.consume("ip-1").allowed).toBe(true);
    expect(limiter.consume("ip-1").allowed).toBe(false);

    jest.advanceTimersByTime(1_001);

    expect(limiter.consume("ip-1").allowed).toBe(true);

    jest.useRealTimers();
  });
});
