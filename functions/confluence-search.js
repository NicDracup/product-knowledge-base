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

    // Split query into meaningful keywords (3+ chars, no stop words)
    const stopWords = new Set(['the','and','are','for','is','in','it','of','to','what','how','does','do','a','an','be','was','with','that','this','have','has','from','on','at','by','or','but','not','can','all','there','which','when','where','who','will','about','get']);
    const keywords = [...new Set(
      query.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w))
    )];

    // Full phrase search first, then individual keywords
    const phraseResults = await fetch(`${base}?cql=${encodeURIComponent(`text ~ "${query}" AND type = page`)}&limit=5`, { headers })
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => d.results || [])
      .catch(() => []);

    const keywordResults = await Promise.all(
      keywords.map(term =>
        fetch(`${base}?cql=${encodeURIComponent(`text ~ "${term}" AND type = page`)}&limit=5`, { headers })
          .then(r => r.ok ? r.json() : { results: [] })
          .then(d => d.results || [])
          .catch(() => [])
      )
    );

    // Phrase results first, then keyword results — deduplicate by page ID
    const seen = new Set();
    const merged = [...phraseResults, ...keywordResults.flat()].filter(r => {
      const id = r.content?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, 10).map(r => ({
      title: r.title,
      excerpt: r.excerpt || '',
      url: `https://confluence.cloud.ballys.com/wiki${r.url}`,
      space: r.resultGlobalContainer?.title || '',
      spaceKey: r.content?._expandable?.container?.replace('/rest/api/space/', '') || ''
    }));

    return new Response(JSON.stringify({ results: merged }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
