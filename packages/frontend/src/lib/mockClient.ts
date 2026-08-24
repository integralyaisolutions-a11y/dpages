export function mockRequest<T>(data: T, delayMs = 300 + Math.random() * 200): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });
}
