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
    const cql = `siteSearch ~ "${query}" AND type = page`;
    const res = await fetch(`${base}?cql=${encodeURIComponent(cql)}&limit=15`, { headers })
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => d.results || [])
      .catch(() => []);
    const clean = (s) => (s || '').replace(/@@@hl@@@/g, '').replace(/@@@endhl@@@/g, '');
    const merged = res.slice(0, 15).map(r => ({
      title: clean(r.title),
      excerpt: clean(r.excerpt),
      url: `https://confluence.cloud.ballys.com/wiki${r.url}`,
      space: r.resultGlobalContainer?.title || '',
      spaceKey: r.content?.space?.key || r.content?._expandable?.space?.replace('/rest/api/space/', '') || ''
    }));
    return new Response(JSON.stringify({ results: merged }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
