export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pageId = url.searchParams.get('id');

  if (!pageId) {
    return new Response(JSON.stringify({ error: 'Missing page ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const email = context.env.CONFLUENCE_EMAIL;
    const token = context.env.CONFLUENCE_TOKEN;
    const auth = btoa(`${email}:${token}`);

    const response = await fetch(
      `https://ballysgroup.atlassian.net/wiki/rest/api/content/${pageId}?expand=body.storage,body.view`,
      { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Confluence returned ${response.status}` }), { status: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
