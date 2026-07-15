function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  function consume(key) {
    const now = Date.now();

    cleanup(now);

    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1 };
    }

    entry.count += 1;

    if (entry.count > max) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: max - entry.count };
  }

  function cleanup(now) {
    if (hits.size < 1000) {
      return;
    }

    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  }

  function reset() {
    hits.clear();
  }

  return { consume, reset };
}

const rateLimiter = {
  createRateLimiter,
};

export default rateLimiter;
