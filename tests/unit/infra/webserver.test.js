const ORIGINAL_ENV = process.env;

// `webserver.origin` é resolvido uma única vez, no carregamento do módulo.
// Para exercitar cada ramo é preciso reimportar com o ambiente já trocado.
async function loadOriginWith(env) {
  let origin;

  await jest.isolateModulesAsync(async () => {
    process.env = { ...ORIGINAL_ENV, ...env };
    const { default: webserver } = await import("@/infra/webserver.js");
    origin = webserver.origin;
  });

  return origin;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("infra/webserver.js", () => {
  test.each(["test", "development"])(
    "aponta para o localhost em NODE_ENV=%s",
    async (nodeEnv) => {
      await expect(loadOriginWith({ NODE_ENV: nodeEnv })).resolves.toBe(
        "http://localhost:3000",
      );
    },
  );

  test("usa a URL efêmera da Vercel em preview", async () => {
    const origin = await loadOriginWith({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "agrdrive-abc123.vercel.app",
    });

    expect(origin).toBe("https://agrdrive-abc123.vercel.app");
  });

  test("usa o domínio próprio em produção", async () => {
    const origin = await loadOriginWith({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_URL: "agrdrive-abc123.vercel.app",
    });

    expect(origin).toBe("https://agrdrive.com.br");
  });

  test("usa o domínio próprio quando VERCEL_ENV não está definido", async () => {
    const origin = await loadOriginWith({
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
    });

    expect(origin).toBe("https://agrdrive.com.br");
  });
});
