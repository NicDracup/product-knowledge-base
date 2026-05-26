export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const email = context.env.CONFLUENCE_EMAIL;
    const token = context.env.CONFLUENCE_TOKEN;
    const auth = btoa(`${email}:${token}`);

    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
    const base = 'https://ballysgroup.atlassian.net/wiki/rest/api/search';

    const productCql = encodeURIComponent(`text ~ "${query}" AND type = page AND space.key in ("bingo","MUL","GOPS","ENGAGE","PO")`);
    const fallbackCql = encodeURIComponent(`text ~ "${query}" AND type = page AND space.key not in ("bingo","MUL","GOPS","ENGAGE","PO","TCD","IE","ProInfDes")`);

    const [productRes, fallbackRes] = await Promise.all([
      fetch(`${base}?cql=${productCql}&limit=5`, { headers }),
      fetch(`${base}?cql=${fallbackCql}&limit=5`, { headers })
    ]);

    const productData = productRes.ok ? await productRes.json() : { results: [] };
    const fallbackData = fallbackRes.ok ? await fallbackRes.json() : { results: [] };

    const combined = [
      ...(productData.results || []),
      ...(fallbackData.results || [])
    ];

    const seen = new Set();
    const results = combined
      .filter(r => {
        if (seen.has(r.content?.id)) return false;
        seen.add(r.content?.id);
        return true;
      })
      .slice(0, 10)
      .map(r => ({
        title: r.title,
        excerpt: r.excerpt || '',
        url: `https://confluence.cloud.ballys.com/wiki${r.url}`,
        space: r.resultGlobalContainer?.title || '',
        spaceKey: r.content?._expandable?.container?.replace('/rest/api/space/', '') || ''
      }));

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
