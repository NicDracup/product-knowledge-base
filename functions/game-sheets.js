export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q') || '';
  const venture = url.searchParams.get('venture') || '';
  const provider = url.searchParams.get('provider') || '';
  const gameType = url.searchParams.get('gameType') || '';
  const platform = url.searchParams.get('platform') || '';

  // At least one filter required
  if (!query && !venture && !provider && !gameType && !platform) {
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

    // Provider variant map -- canonical name to all Contentful variants
    const PROVIDER_VARIANTS = {
      'Light & Wonder': ['Light & Wonder', 'Light And Wonder'],
      'Pragmatic Play': ['PragmaticPlay', 'Pragmatic Play', 'Pragmatic'],
      'Games Global': ['Games Global', 'Games Global (GGL)'],
      'Area Vegas': ['Area Vegas', 'AreaVegas Games'],
      'Push Gaming': ['Push Gaming', 'Push Actions', 'Push Originals'],
      'YGG Drasil': ['YGG Drasil', 'Yggdrasil'],
    };

    // Step 1: Get matching live cashier game names (filtered by venture and/or gameType)
    let cashierParams = `content_type=cashierGameConfig&fields.live=yes&limit=1000`;
    if (venture) cashierParams += `&fields.ventures=${encodeURIComponent(venture)}`;
    if (gameType) cashierParams += `&fields.gameType=${encodeURIComponent(gameType)}`;

    const cashierRes = await fetch(`${baseUrl}?${cashierParams}&select=fields.gameName,fields.ventures,fields.live,fields.pp,fields.integration,fields.w2gReportable,fields.groupCompliant,fields.miniGame,fields.progressive,fields.isRng,fields.gameType,fields.gameSkinName,fields.gameProductName,fields.gameId`, { headers });
    const cashierData = cashierRes.ok ? await cashierRes.json() : { items: [] };

    // Build cashier lookup by game name (uppercase)
    const cashierLookup = {};
    for (const item of (cashierData.items || [])) {
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

    const liveGameNames = new Set(Object.keys(cashierLookup));
    if (liveGameNames.size === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Step 2: Get matching gameV2 entries
    let gameParams = `content_type=gameV2&limit=200`;
    if (query) gameParams += `&query=${encodeURIComponent(query)}`;

    // Provider filtering -- expand variants
    if (provider) {
      const variants = PROVIDER_VARIANTS[provider] || [provider];
      if (variants.length === 1) {
        gameParams += `&fields.gamePlatformConfig.en-GB.gameStudio=${encodeURIComponent(variants[0])}`;
      }
      // Multiple variants handled client-side below
    }

    if (platform) gameParams += `&fields.platformVisibility=${encodeURIComponent(platform)}`;

    const gameRes = await fetch(`${baseUrl}?${gameParams}`, { headers });
    const gameData = gameRes.ok ? await gameRes.json() : { items: [] };

    // Step 3: Cross reference and build results
    const providerVariants = provider ? (PROVIDER_VARIANTS[provider] || [provider]) : null;

    const results = [];
    for (const item of (gameData.items || [])) {
      try {
        const f = item.fields || {};
        const config = (f.gamePlatformConfig && (f.gamePlatformConfig['en-GB'] || f.gamePlatformConfig)) || {};
        const gameTypeObj = config.gameType || {};
        const entryTitle = (f.entryTitle && (f.entryTitle['en-GB'] || f.entryTitle)) || '';
        const title = (f.title && (f.title['en-GB'] || f.title)) || '';
        const studio = config.gameStudio || config.gameProvider || '';

        // Filter by provider variants if multiple
        if (providerVariants && providerVariants.length > 1) {
          if (!providerVariants.includes(studio)) continue;
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
          gameType: gameTypeObj.type || '',
          features: gameTypeObj.features || [],
          paylines: gameTypeObj.winLines || '',
          maxMultiplier: gameTypeObj.maxMultiplier || '',
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

    // Sort alphabetically by title
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
