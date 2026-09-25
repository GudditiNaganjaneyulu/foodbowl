import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

/** Lazily created so nothing connects to SMTP unless an email is actually sent. */
export function getMailer(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}
