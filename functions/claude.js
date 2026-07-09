export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    const body = await context.request.json();
    const gatewayKey = context.env.AI_GATEWAY_KEY;
    const gatewayBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: body.max_tokens || 600,
      messages: [
        { role: 'system', content: body.system || '' },
        ...body.messages
      ]
    };
    const response = await fetch('https://genaigateway.ballys.tech/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayKey}`
      },
      body: JSON.stringify(gatewayBody)
    });
    const data = await response.json();
    const converted = {
      content: [
        { type: 'text', text: data.choices?.[0]?.message?.content || 'Sorry, no response.' }
      ],
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0
      }
    };
    return new Response(JSON.stringify(converted), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
