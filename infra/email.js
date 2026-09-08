import nodemailer from "nodemailer";
import { ServiceError } from "./errors.js";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: process.env.EMAIL_SMTP_PORT,
  auth: {
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASSWORD,
  },
  secure: process.env.NODE_ENV === "production" ? true : false,
});

// Remetente num lugar só. Estava repetido como literal em cada model que
// mandava e-mail, o que garantia que um dia divergiriam. Um `from`
// explícito no chamador ainda vence, porque o spread vem depois.
const DEFAULT_FROM =
  process.env.EMAIL_FROM || "AgrDrive <contato@agrdrive.com.br>";

async function send(mailOptions) {
  try {
    await transporter.sendMail({ from: DEFAULT_FROM, ...mailOptions });
  } catch (error) {
    throw new ServiceError({
      message: "Não foi possível enviar o email.",
      action: "Verifique se o serviço de email está disponível.",
      cause: error,
      context: mailOptions,
    });
  }
}

const email = {
  send,
  DEFAULT_FROM,
};

export default email;
