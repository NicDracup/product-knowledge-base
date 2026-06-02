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
      `https://api.contentful.com/spaces/${spaceId}/environments/master/entries?content_type=gameV2&query=${encodeURIComponent(query)}&limit=10`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `Contentful returned ${res.status}`, detail: errText }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    const data = await res.json();
    const results = (data.items || []).map(item => {
      try {
        const f = item.fields || {};
        const config = (f.gamePlatformConfig && (f.gamePlatformConfig['en-GB'] || f.gamePlatformConfig)) || {};
        const gameType = config.gameType || {};
        const intro = (f.introductionContent && (f.introductionContent['en-GB'] || f.introductionContent)) || '';
        const title = (f.title && (f.title['en-GB'] || f.title)) || '';
        const excerpt = typeof intro === 'string' ? intro.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        const platformRaw = f.platformVisibility && (f.platformVisibility['en-GB'] || f.platformVisibility);
        const platform = Array.isArray(platformRaw) ? platformRaw : (config.platform || []);        return {
          title,
          excerpt,
          provider: config.gameStudio || config.gameProvider || '',
          gameType: gameType.type || '',
          features: gameType.features || [],
          paylines: gameType.winLines || '',
          maxMultiplier: gameType.maxMultiplier || '',
          progressiveJackpot: (f.progressiveJackpot && (f.progressiveJackpot['en-GB'] ?? f.progressiveJackpot)) ?? false,
          volatility: gameType.volatility || '',
          waysToWin: gameType.waysToWin || '',
          winLineType: gameType.winLineType || '',
          platform: platform,
          demoUrl: config.demoUrl || '',
          realUrl: config.realUrl || '',
          infoDetails: (f.infoDetails && (f.infoDetails['en-GB'] || f.infoDetails)) || '',
          entryId: item.sys && item.sys.id ? item.sys.id : ''
        };
      } catch(e) {
        return null;
      }
    }).filter(Boolean);
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
