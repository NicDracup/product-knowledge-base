export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await context.request.json();
    const groqKey = context.env.GROQ_API_KEY;

    const groqBody = {
      model: 'llama-3.3-70b-versatile',
      max_completion_tokens: body.max_tokens || 600,
      messages: [
        { role: 'system', content: body.system || '' },
        ...body.messages
      ]
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify(groqBody)
    });

    const data = await response.json();
    const converted = {
      content: [
        { type: 'text', text: data.choices?.[0]?.message?.content || 'Sorry, no response.' }
      ]
    };

    return new Response(JSON.stringify(converted), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
