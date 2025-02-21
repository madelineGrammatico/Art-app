import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_KEY);

export async function sendResetPasswordEmail(email: string, token: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/resetForgotPassword/${token}`;

  const res = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: 'Réinitialisation de mot de passe',
    html: `<p>Réinitialisez votre mot de passe en cliquant sur le lien ci-dessous :</p><a href="${resetUrl}">Réinitialiser le mot de passe</a>`,
  });
  return res
}