export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pageId = url.searchParams.get('pageId');
  const filename = url.searchParams.get('filename');
  if (!pageId || !filename) {
    return new Response('Missing pageId or filename', { status: 400 });
  }
  try {
    const email = context.env.CONFLUENCE_EMAIL;
    const token = context.env.CONFLUENCE_TOKEN;
    const auth = btoa(`${email}:${token}`);
    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
    const base = 'https://ballysgroup.atlassian.net/wiki';

    // 1. List the page's attachments and find the one matching the filename
    const listRes = await fetch(`${base}/rest/api/content/${pageId}/child/attachment?limit=100`, { headers });
    if (!listRes.ok) return new Response('Could not list attachments', { status: 502 });
    const listData = await listRes.json();
    const match = (listData.results || []).find(a => a.title === filename);
    if (!match) return new Response('Attachment not found', { status: 404 });

    // 2. Get its download path and fetch the actual file bytes (with auth)
    const downloadPath = match._links && match._links.download;
    if (!downloadPath) return new Response('No download link', { status: 404 });
    const fileRes = await fetch(base + downloadPath, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    if (!fileRes.ok) return new Response('Could not fetch file', { status: 502 });

    // 3. Stream it back with the right content type so <video> can play it
    const contentType = match.metadata?.mediaType || fileRes.headers.get('content-type') || 'video/mp4';
    return new Response(fileRes.body, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes'
      }
    });
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 });
  }
}
