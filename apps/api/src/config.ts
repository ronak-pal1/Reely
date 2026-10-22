import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_URL: z.string().default("http://localhost:4000"),
  LOG_LEVEL: z.string().default("info"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/reelio"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().default("http://localhost:4000/auth/google/callback"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("REELIO <noreply@example.com>"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = EnvSchema.parse(env);
  if (config.NODE_ENV === "production") {
    if (config.JWT_ACCESS_SECRET.startsWith("dev-") || config.JWT_REFRESH_SECRET.startsWith("dev-")) {
      throw new Error("Refusing to start with a development JWT secret");
    }
  }
  return config;
}
