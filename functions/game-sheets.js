export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q') || '';
  const venture = url.searchParams.get('venture') || '';
  const provider = url.searchParams.get('provider') || '';
  const gameType = url.searchParams.get('gameType') || '';
  const platform = url.searchParams.get('platform') || '';
  const aggregator = url.searchParams.get('aggregator') || '';
  const winLineType = url.searchParams.get('winLineType') || '';
  const feature = url.searchParams.get('feature') || '';
  const theme = url.searchParams.get('theme') || '';

  if (!query && !venture && !provider && !gameType && !platform && !aggregator && !winLineType && !feature && !theme) {
    return new Response(JSON.stringify({ results: [], error: 'No filters provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const token = context.env.CONTENTFUL_TOKEN;
    const spaceId = '08wz2hjuit8t';
    const baseUrl = `https://api.contentful.com/spaces/${spaceId}/environments/master/entries`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const PROVIDER_VARIANTS = {
      'Light & Wonder': ['Light & Wonder', 'Light And Wonder'],
      'Pragmatic Play': ['PragmaticPlay', 'Pragmatic Play', 'Pragmatic'],
      'Games Global': ['Games Global', 'Games Global (GGL)'],
      'Area Vegas': ['Area Vegas', 'AreaVegas Games'],
      'Push Gaming': ['Push Gaming', 'Push Actions', 'Push Originals'],
      'YGG Drasil': ['YGG Drasil', 'Yggdrasil'],
    };

    // Step 1: Fetch ALL matching cashier entries (paginated)
    let cashierParams = `content_type=cashierGameConfig&fields.live=yes`;
    if (venture) cashierParams += `&fields.ventures=${encodeURIComponent(venture)}`;
    if (gameType) cashierParams += `&fields.gameType=${encodeURIComponent(gameType)}`;

    const cashierLookup = {};
    let cashierSkip = 0;
    const cashierLimit = 200;

    while (true) {
      const cashierRes = await fetch(`${baseUrl}?${cashierParams}&limit=${cashierLimit}&skip=${cashierSkip}`, { headers });
      const cashierData = cashierRes.ok ? await cashierRes.json() : { items: [], total: 0 };
      const items = cashierData.items || [];
      const total = cashierData.total || 0;

      for (const item of items) {
        const f = item.fields || {};
        const g = k => f[k] && (f[k]['en-GB'] !== undefined ? f[k]['en-GB'] : f[k]);
        const name = g('gameName');
        if (name) {
          cashierLookup[name.toUpperCase()] = {
            gameId: g('gameId') || '',
            gameName: name,
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
        }
      }

      cashierSkip += cashierLimit;
      if (cashierSkip >= total) break;
    }

    const liveGameNames = new Set(Object.keys(cashierLookup));

    if (liveGameNames.size === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Step 2: Fetch ALL matching gameV2 entries (paginated)
    let gameParams = `content_type=gameV2`;
    if (query) gameParams += `&query=${encodeURIComponent(query)}`;
    if (platform) gameParams += `&fields.platformVisibility=${encodeURIComponent(platform)}`;

    const providerVariants = provider ? (PROVIDER_VARIANTS[provider] || [provider]) : null;

    const allGameItems = [];
    let gameSkip = 0;
    const gameLimit = 200;

    while (true) {
      const gameRes = await fetch(`${baseUrl}?${gameParams}&limit=${gameLimit}&skip=${gameSkip}`, { headers });
      const gameData = gameRes.ok ? await gameRes.json() : { items: [], total: 0 };
      const items = gameData.items || [];
      const total = gameData.total || 0;

      allGameItems.push(...items);
      gameSkip += gameLimit;
      if (gameSkip >= total) break;
    }

    // Step 3: Cross reference and build results
    const results = [];

    for (const item of allGameItems) {
      try {
        const f = item.fields || {};
        const config = (f.gamePlatformConfig && (f.gamePlatformConfig['en-GB'] || f.gamePlatformConfig)) || {};
        const gameTypeObj = config.gameType || {};
        const entryTitle = (f.entryTitle && (f.entryTitle['en-GB'] || f.entryTitle)) || '';
        const title = (f.title && (f.title['en-GB'] || f.title)) || '';
        const studio = config.gameStudio || config.gameProvider || '';

        // Filter by provider variants
        if (providerVariants) {
          if (!providerVariants.includes(studio)) continue;
        }

        // Filter by aggregator
        if (aggregator) {
          const aggVariants = PROVIDER_VARIANTS[aggregator] || [aggregator];
          if (!aggVariants.includes(config.gameAggregator || '')) continue;
        }

        // Filter by win line type
        if (winLineType) {
          if ((gameTypeObj.winLineType || '') !== winLineType) continue;
        }

        // Filter by feature
        if (feature) {
          if (!(gameTypeObj.features || []).includes(feature)) continue;
        }

        // Filter by theme
        if (theme) {
          if (!(gameTypeObj.themes || []).includes(theme)) continue;
        }

        // Only include if matched in cashier live list
        if (!liveGameNames.has(entryTitle.toUpperCase())) continue;

        const cashier = cashierLookup[entryTitle.toUpperCase()] || null;
        const intro = (f.introductionContent && (f.introductionContent['en-GB'] || f.introductionContent)) || '';
        const excerpt = typeof intro === 'string' ? intro.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        const platformRaw = f.platformVisibility && (f.platformVisibility['en-GB'] || f.platformVisibility);
        const platformArr = Array.isArray(platformRaw) ? platformRaw : (config.platform || []);

        results.push({
          title,
          entryTitle,
          excerpt,
          provider: studio,
          gameStudio: config.gameStudio || '',
          gameAggregator: config.gameAggregator || '',
          gameType: gameTypeObj.type || '',
          subGameType: config.subGameType || '',
          contractGameType: config.contractGameType || '',
          features: gameTypeObj.features || [],
          themes: gameTypeObj.themes || [],
          rtp: config.rtp || '',
          reel: gameTypeObj.reel || '',
          winLines: gameTypeObj.winLines || '',
          paylines: gameTypeObj.winLines || '',
          maxMultiplier: gameTypeObj.maxMultiplier || '',
          maxWin: gameTypeObj.maxExposure || '',
          progressiveJackpot: (f.progressiveJackpot && (f.progressiveJackpot['en-GB'] ?? f.progressiveJackpot)) ?? false,
          volatility: gameTypeObj.volatility || '',
          waysToWin: gameTypeObj.waysToWin || '',
          winLineType: gameTypeObj.winLineType || '',
          platform: platformArr,
          demoUrl: config.demoUrl || '',
          realUrl: config.realUrl || '',
          infoDetails: (f.infoDetails && (f.infoDetails['en-GB'] || f.infoDetails)) || '',
          entryId: item.sys?.id || '',
          cashierConfig: cashier
        });
      } catch(e) {
        continue;
      }
    }

    results.sort((a, b) => a.title.localeCompare(b.title));

    return new Response(JSON.stringify({ results, total: results.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
