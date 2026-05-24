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

    const cql = encodeURIComponent(
      `text ~ "${query}" AND type = page ORDER BY lastModified DESC`
    );

    const response = await fetch(
      `https://ballysgroup.atlassian.net/wiki/rest/api/search?cql=${cql}&limit=15`,
      { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Search returned ${response.status}` }), { status: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const data = await response.json();

    // Only keep product-relevant spaces
    const allowedSpaceKeys = ['bingo', 'MUL', 'GOPS', 'ENGAGE', 'PO'];
    const results = (data.results || [])
      .filter(r => {
        const spaceKey = (r.space?.key || '').toLowerCase();
        return allowedSpaceKeys.map(k => k.toLowerCase()).includes(spaceKey);
      })
      .slice(0, 10)
      .map(r => ({
        title: r.title,
        excerpt: r.excerpt || '',
        url: `https://confluence.cloud.ballys.com/wiki${r.url}`,
        space: r.resultGlobalContainer?.title || '',
        spaceKey: r.space?.key || ''
      }));

    // Sources array — Contentful can be added here later as a second source
    return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
