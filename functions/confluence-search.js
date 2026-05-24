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

    // No ORDER BY — let Confluence rank by relevance
    const cql = encodeURIComponent(`text ~ "${query}" AND type = page`);

    const response = await fetch(
      `https://ballysgroup.atlassian.net/wiki/rest/api/search?cql=${cql}&limit=10`,
      { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Search returned ${response.status}` }), { status: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const data = await response.json();

    // Filter out noise, keep product-relevant results
    const noiseSpaces = ['proinfdes'];
    const noiseTitles = [/^INC-\d+/i, /^(Re|Fw):/i, /^DO NOT USE/i, /Q&A Test Run/i];

    const results = (data.results || [])
      .filter(r => {
        const spaceKey = (r.space?.key || '').toLowerCase();
        const title = r.title || '';
        if (noiseSpaces.includes(spaceKey)) return false;
        if (noiseTitles.some(re => re.test(title))) return false;
        return true;
      })
      .map(r => ({
        title: r.title,
        excerpt: r.excerpt || '',
        url: `https://confluence.cloud.ballys.com/wiki${r.url}`,
        space: r.resultGlobalContainer?.title || '',
        spaceKey: r.space?.key || ''
      }));

    return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
