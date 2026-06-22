interface MailEnv {
  MAIL_SERVICE_URL?: string
  MAIL_SERVICE_KEY?: string
}

async function send(env: MailEnv, to: string, subject: string, html: string) {
  if (!env.MAIL_SERVICE_URL) {
    console.log(`[mailer] MAIL_SERVICE_URL not set, logging instead`)
    console.log(`[mailer] Email to ${to}: ${subject}`)
    return
  }

  const res = await fetch(`${env.MAIL_SERVICE_URL}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.MAIL_SERVICE_KEY ? { 'X-Api-Key': env.MAIL_SERVICE_KEY } : {}),
    },
    body: JSON.stringify({ to, subject, html }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[mailer] Failed to send email: ${res.status} ${text}`)
    throw new Error('Failed to send verification email')
  }
}

export async function sendBindEmail(
  env: MailEnv,
  email: string,
  code: string,
): Promise<void> {
  await send(
    env,
    email,
    'DocuSync 绑定邮箱',
    `<p>你的验证码：</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>10 分钟内有效。如非本人操作，请忽略。</p>`,
  )
}

export async function sendRecoveryEmail(
  env: MailEnv,
  email: string,
  code: string,
): Promise<void> {
  await send(
    env,
    email,
    'DocuSync 恢复文档历史',
    `<p>你的验证码：</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>10 分钟内有效。如非本人操作，请忽略。</p>`,
  )
}
