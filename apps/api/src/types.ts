export {};

declare global {
  // Express augments Request through the namespace interface.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}
