export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pageId = url.searchParams.get('id');
  const children = url.searchParams.get('children');

  if (!pageId) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const email = context.env.CONFLUENCE_EMAIL;
    const token = context.env.CONFLUENCE_TOKEN;
    const auth = btoa(`${email}:${token}`);

    let apiUrl;
    if (children === 'true') {
      // Fetch child pages of a given page
      apiUrl = `https://ballysgroup.atlassian.net/wiki/rest/api/content/${pageId}/child/page?limit=50`;
    } else {
      // Fetch page content
      apiUrl = `https://ballysgroup.atlassian.net/wiki/rest/api/content/${pageId}?expand=body.view,body.storage`;
    }

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Confluence returned ${response.status}` }), { status: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const data = await response.json();

    if (children === 'true') {
      // Return child pages as a simple array
      const results = (data.results || []).map(p => ({
        id: p.id,
        title: p.title,
        url: `https://confluence.cloud.ballys.com/wiki${p._links?.webui || ''}`
      }));
      return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
