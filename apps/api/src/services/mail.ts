import nodemailer from "nodemailer";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";

export async function sendMail(input: { to: string; subject: string; text: string }): Promise<void> {
  const config = getConfig();
  if (!config.SMTP_HOST) {
    logger.info({ to: input.to, subject: input.subject, text: input.text }, "email skipped; SMTP is unset");
    return;
  }
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  await transport.sendMail({
    from: config.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
