// src/lib/mailer.ts
import nodemailer from "nodemailer";

// Kiszűrjük az undefined értékeket a TypeScript build idejére
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || `"SZESSISTANT" <${smtpUser}>`;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465, // 465 esetén true, 587 esetén false
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
  return await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    html,
  });
}