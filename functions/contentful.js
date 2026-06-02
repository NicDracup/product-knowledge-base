export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q');
  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const token = context.env.CONTENTFUL_TOKEN;
    const spaceId = '08wz2hjuit8t';
    const res = await fetch(
      `https://api.contentful.com/spaces/${spaceId}/environments/master/entries?content_type=gameV2&query=${encodeURIComponent(query)}&select=fields.title,fields.gamePlatformConfig,fields.infoDetails,fields.introductionContent,fields.progressiveJackpot&limit=10`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Contentful returned ${res.status}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    const data = await res.json();
    const results = (data.items || []).map(item => {
      const f = item.fields;
      const config = f.gamePlatformConfig?.['en-GB'] || f.gamePlatformConfig || {};
      const gameType = config.gameType || {};
      const intro = f.introductionContent?.['en-GB'] || f.introductionContent || '';
      const title = f.title?.['en-GB'] || f.title || '';
      const excerpt = intro.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
      return {
        title,
        excerpt,
        provider: config.gameStudio || config.gameProvider || '',
        gameType: gameType.type || '',
        features: gameType.features || [],
        paylines: gameType.winLines || '',
        maxMultiplier: gameType.maxMultiplier || '',
        progressiveJackpot: f.progressiveJackpot?.['en-GB'] ?? f.progressiveJackpot ?? false,
        volatility: gameType.volatility || '',
        waysToWin: gameType.waysToWin || '',
        winLineType: gameType.winLineType || '',
        platform: config.platform || [],
        demoUrl: config.demoUrl || '',
        realUrl: config.realUrl || '',
        infoDetails: f.infoDetails?.['en-GB'] || f.infoDetails || '',
        entryId: item.sys.id
      };
    });
    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
