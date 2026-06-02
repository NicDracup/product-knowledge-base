export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q');
  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const token = context.env.CONTENTFUL_TOKEN;
    const spaceId = '08wz2hjuit8t';
    const baseUrl = `https://api.contentful.com/spaces/${spaceId}/environments/master/entries`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const [gameV2Res, cashierRes] = await Promise.all([
      fetch(`${baseUrl}?content_type=gameV2&query=${encodeURIComponent(query)}&limit=10`, { headers }),
      fetch(`${baseUrl}?content_type=cashierGameConfig&query=${encodeURIComponent(query)}&limit=10`, { headers })
    ]);

    const [gameV2Data, cashierData] = await Promise.all([
      gameV2Res.ok ? gameV2Res.json() : { items: [] },
      cashierRes.ok ? cashierRes.json() : { items: [] }
    ]);

    const gameV2Results = (gameV2Data.items || []).map(item => {
      try {
        const f = item.fields || {};
        const config = (f.gamePlatformConfig && (f.gamePlatformConfig['en-GB'] || f.gamePlatformConfig)) || {};
        const gameType = config.gameType || {};
        const intro = (f.introductionContent && (f.introductionContent['en-GB'] || f.introductionContent)) || '';
        const title = (f.title && (f.title['en-GB'] || f.title)) || '';
        const excerpt = typeof intro === 'string' ? intro.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        const platformRaw = f.platformVisibility && (f.platformVisibility['en-GB'] || f.platformVisibility);
        const platform = Array.isArray(platformRaw) ? platformRaw : (config.platform || []);
        return {
          title,
          entryTitle: (f.entryTitle && (f.entryTitle['en-GB'] || f.entryTitle)) || '',
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
          platform,
          demoUrl: config.demoUrl || '',
          realUrl: config.realUrl || '',
          infoDetails: (f.infoDetails && (f.infoDetails['en-GB'] || f.infoDetails)) || '',
          entryId: item.sys?.id || '',
          cashierConfig: null
        };
      } catch(e) {
        return null;
      }
    }).filter(Boolean);

    const cashierResults = (cashierData.items || []).map(item => {
      try {
        const f = item.fields || {};
        const g = k => f[k] && (f[k]['en-GB'] !== undefined ? f[k]['en-GB'] : f[k]);
        return {
          gameId: g('gameId') || '',
          gameName: g('gameName') || '',
          skinName: g('gameSkinName') || '',
          productName: g('gameProductName') || '',
          ventures: g('ventures') || [],
          w2gReportable: g('w2gReportable') ?? false,
          groupCompliant: g('groupCompliant') ?? false,
          miniGame: g('miniGame') ?? false,
          progressive: g('progressive') ?? false,
          integration: Array.isArray(g('integration')) ? g('integration').includes('yes') : false,
          pp: Array.isArray(g('pp')) ? g('pp').includes('yes') : false,
          live: Array.isArray(g('live')) ? g('live').includes('yes') : false,
          entryId: item.sys?.id || ''
        };
      } catch(e) {
        return null;
      }
    }).filter(Boolean);

    gameV2Results.forEach(game => {
      const match = cashierResults.find(c =>
        c.gameName && game.entryTitle &&
        c.gameName.toUpperCase() === game.entryTitle.toUpperCase()
      );
      if (match) game.cashierConfig = match;
    });

    const unmatchedCashier = cashierResults.filter(c =>
      !gameV2Results.some(g => g.cashierConfig && g.cashierConfig.entryId === c.entryId)
    );

    unmatchedCashier.forEach(c => {
      gameV2Results.push({
        title: c.gameName || '',
        excerpt: '',
        provider: '',
        gameType: '',
        features: [],
        paylines: '',
        maxMultiplier: '',
        progressiveJackpot: false,
        volatility: '',
        waysToWin: '',
        winLineType: '',
        platform: [],
        demoUrl: '',
        realUrl: '',
        infoDetails: '',
        entryId: '',
        cashierConfig: c
      });
    });

    return new Response(JSON.stringify({ results: gameV2Results }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
