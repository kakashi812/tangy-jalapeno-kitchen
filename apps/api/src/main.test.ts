import { afterEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  create: vi.fn(),
  listen: vi.fn(),
  configure: vi.fn(),
}));
vi.mock('node:fs', () => ({ existsSync: () => false }));
vi.mock('@nestjs/core', () => ({ NestFactory: { create: f.create } }));
vi.mock('./app.module.js', () => ({ AppModule: class {} }));
vi.mock('./app.setup.js', () => ({ configureApp: f.configure }));
vi.mock('./config/env.js', () => ({ loadEnv: () => ({ PORT: 4000 }) }));

describe('serverless-compatible entrypoint', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('finishes loading while the platform holds the listening callback', async () => {
    f.create.mockResolvedValue({ listen: f.listen });
    f.listen.mockReturnValue(new Promise(() => {}));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        import('./main.js'),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Entrypoint import deadlocked')), 1000);
        }),
      ]);
      expect(f.configure).toHaveBeenCalledOnce();
      expect(f.listen).toHaveBeenCalledWith(4000);
    } finally {
      clearTimeout(timer);
    }
  });

  it('reports an asynchronous startup failure and exits unsuccessfully', async () => {
    const error = new Error('Startup fixture failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.create.mockResolvedValue({ listen: f.listen });
    f.listen.mockRejectedValue(error);
    await import('./main.js');
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Failed to start the API:', error));
    expect(process.exitCode).toBe(1);
  });
});
