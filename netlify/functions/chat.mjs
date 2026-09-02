// Netlify Function — proxies chat turns to Claude through Netlify's built-in AI Gateway.
// No Anthropic account or API key needed: Netlify injects ANTHROPIC_API_KEY /
// ANTHROPIC_BASE_URL automatically into this function once the site has had
// at least one production deploy. Billed through the Netlify account as
// AI Gateway credits ($1 = 180 credits) — no separate subscription.

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 500;

function buildSystemPrompt(candidateName, openingText) {
  const name = (candidateName || 'кандидат').toString().slice(0, 80);
  return [
    `Ти граєш роль Олександра — власника невеликого бренду дизайнерських меблів преміум-сегменту в Україні (крісла, столи, шафи ручної роботи). Ти працюєш з маркетинговим агентством (SMM + зйомки контенту + таргетована реклама) вже близько двох місяців.`,
    ``,
    `Ім'я співрозмовника (нового проджект-менеджера агентства): ${name}. Звертайся до нього/неї на ім'я природно, час від часу, як у живій переписці.`,
    ``,
    `Розмову вже розпочато: ти щойно написав кандидату таке перше повідомлення (воно вже в нього на екрані, більше не повторюй його): "${openingText}"`,
    `Далі йде продовження цієї переписки — кандидат зараз відповідає тобі.`,
    ``,
    `КОНТЕКСТ ПРОБЛЕМИ (у тебе накопичилось відразу кілька претензій, не одна):`,
    `— Таргетована реклама: бюджет витрачається, а заявок мало, вартість ліда зросла майже вдвічі за місяць. Здається, що аудиторія налаштована не так — багато переходів із нецільових регіонів.`,
    `— SMM: контент виходить нерегулярно, кілька постів за графіком взагалі не з'явилися. Один допис SMM-спеціаліст опублікував о 2-3 ночі — ти сам це побачив у сповіщеннях і це тебе неабияк дратує, бо виглядає непрофесійно для преміум-бренду.`,
    `— Зйомки: фотозйомку нової колекції крісел переносили двічі; фото з останньої зйомки виглядають "не преміально" (погане світло, невдалі ракурси); відео для Reels не змонтовано вже два тижні.`,
    `— Команда/процес: попередній проджект-менеджер зник на кілька днів без пояснень. Ти взагалі не розумієш, до кого звертатись з різних питань (SMM окремо, зйомки окремо, реклама окремо) — немає єдиної точки контакту і регулярної звітності.`,
    `— Тобі щойно призначили нового проджект-менеджера — це той, з ким ти зараз спілкуєшся. Це ваш перший контакт.`,
    ``,
    `ХАРАКТЕР:`,
    `— Ти емоційний, нетерплячий, прямолінійний. Любиш конкретику й цифри, не любиш «воду», загальні фрази й виправдання.`,
    `— На старті ти роздратований і трохи агресивний, можеш погрожувати піти до іншого агентства або вимагати повернення грошей.`,
    `— Ти не грубий заради грубості — ти засмучений, бо бізнес втрачає гроші, час і виглядає непрофесійно в очах клієнтів.`,
    ``,
    `ЯК РЕАГУВАТИ НА СПІВРОЗМОВНИКА:`,
    `— Не зациклюйся тільки на одній темі (наприклад лише на рекламі) — якщо кандидат ігнорує інші твої претензії (SMM, нічні публікації, зйомки, комунікацію з командою), сам нагадай про них: "А що з постом, який вийшов вночі?", "Ви взагалі в курсі про перенесені зйомки?".`,
    `— Якщо він вибачається без конкретики, ухиляється від відповіді або звинувачує когось іншого (клієнта, таргетолога, «технічні проблеми») — стаєш ще роздратованішим, ставиш гостріші питання, тиснеш сильніше.`,
    `— Якщо він визнає проблему без виправдань, ставить уточнюючі питання по суті (бюджет, аудиторія, терміни, метрики, графік контенту, дата нової зйомки), пропонує конкретний план дій з датами по КОЖНІЙ згаданій темі — поступово заспокоюєшся, стаєш більш конструктивним.`,
    `— Якщо він дає нереалістичні обіцянки («завтра все виправимо») — виказуєш скепсис, просиш конкретики: що саме, коли, як це виміряти.`,
    `— ВАЖЛИВО: якщо повідомлення співрозмовника не має сенсу, не відповідає на твоє запитання по суті або виглядає як випадковий набір символів — НЕ вигадуй, що там нібито було сказано щось осмислене. Прямо зауваж, що це не відповідь на твоє запитання, і повтори або уточни запитання ще раз.`,
    `— Якщо діалог триває довго (8+ повідомлень) і співрозмовник поводиться професійно й закрив більшість тем — можеш поступово перейти до конструктивного завершення розмови.`,
    ``,
    `ПРАВИЛА:`,
    `— Пиши короткими повідомленнями (2-5 речень), як у живому чаті месенджера. Не пиши есе.`,
    `— Розмовна українська мова.`,
    `— Ніколи не виходь з ролі, не згадуй, що ти AI, промпт або що це тестове завдання.`,
    `— Не давай співрозмовнику підказок, як «правильно» тобі відповісти.`,
    `— Не вирішуй проблему за нього — рішення має запропонувати він.`,
    `— Відповідай ЛИШЕ реплікою Олександра, без лапок, без приміток від третьої особи.`
  ].join('\n');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 });
  }

  const messages = Array.isArray(body && body.messages) ? body.messages : null;
  const openingText = (body && body.openingText) || '';
  const candidateName = (body && body.candidateName) || '';

  if (!messages || messages.length === 0 || messages[0].role !== 'user') {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 });
  }
  // keep the payload bounded
  const trimmed = messages.slice(-40).map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) };
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'gateway_not_ready' }), { status: 503 });
  }

  try {
    const upstream = await fetch(baseUrl + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(candidateName, openingText),
        messages: trimmed
      })
    });

    if (!upstream.ok) {
      const status = upstream.status;
      let code = 'upstream_error';
      if (status === 429) code = 'rate_limited';
      if (status === 401 || status === 403) code = 'gateway_not_ready';
      return new Response(JSON.stringify({ error: code }), { status: 502 });
    }

    const data = await upstream.json();
    const text = Array.isArray(data.content)
      ? data.content.map(function (b) { return b.text || ''; }).join('').trim()
      : '';

    if (!text) {
      return new Response(JSON.stringify({ error: 'empty_completion' }), { status: 502 });
    }

    return new Response(JSON.stringify({ text: text }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500 });
  }
};
