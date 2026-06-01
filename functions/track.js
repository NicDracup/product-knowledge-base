export async function onRequest(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const kv = context.env.PKB_ANALYTICS;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (context.request.method === 'POST') {
    try {
      const body = await context.request.json();
      const type = body.type;
      const value = body.value || '';

      // Increment counter for this event type
      const key = `count:${type}${value ? ':' + value : ''}`;
      const existing = await kv.get(key);
      const count = existing ? parseInt(existing) + 1 : 1;
      await kv.put(key, String(count));

      // Log recent events (keep last 100)
      const recentKey = 'recent:events';
      const recentRaw = await kv.get(recentKey);
      const recent = recentRaw ? JSON.parse(recentRaw) : [];
      recent.unshift({ type, value, ts: new Date().toISOString() });
      if (recent.length > 100) recent.length = 100;
      await kv.put(recentKey, JSON.stringify(recent));

      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  if (context.request.method === 'GET' && action === 'read') {
    try {
      // Get all keys
      const list = await kv.list();
      const counts = {};
      for (const key of list.keys) {
        if (key.name.startsWith('count:')) {
          const val = await kv.get(key.name);
          counts[key.name.replace('count:', '')] = parseInt(val) || 0;
        }
      }
      const recentRaw = await kv.get('recent:events');
      const recent = recentRaw ? JSON.parse(recentRaw) : [];
      return new Response(JSON.stringify({ counts, recent }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: corsHeaders });
}
